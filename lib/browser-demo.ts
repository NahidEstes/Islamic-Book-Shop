import { seedProducts } from "./catalog";
import { productSchema } from "./validation";
import type { Product } from "./types";
import type { Asset, StockHistoryEntry } from "./commerce-types";

// This adapter is selected by /config only for the embedded, server-read-only demo.
// Its session is a local UI convenience; it grants no API/server permissions.
export const demoCatalogEvent = "noor-demo-catalog-change";
export const demoRevisionKey = "noor-demo-catalog-revision-v1";
const sessionKey = "noor-demo-catalog-admin-v1";
type State = { products: Product[]; assets: Asset[]; history: (StockHistoryEntry & { productId: string; requestId?: string; added?: number })[] };
let database: Promise<IDBDatabase> | undefined;
const urls = new Map<string, string>();
const initial = (): State => ({ products: seedProducts.map((p) => ({ ...structuredClone(p), sample: true, tags: [], galleryAssetIds: [], previewAssetIds: [], previewPermission: false })), assets: [], history: [] });
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("এই ব্রাউজারে ডেমো ডেটা রাখার সুবিধা নেই।")); return; }
    const req = indexedDB.open("noor-demo-catalog-v1", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("data"); req.result.createObjectStore("files"); };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); database = undefined; }; resolve(req.result); };
    req.onerror = () => reject(new Error("ব্রাউজারে ডেমো ডেটা খোলা যায়নি। সাইটের স্টোরেজের অনুমতি পরীক্ষা করুন।"));
    req.onblocked = () => reject(new Error("ডেমোর অন্য ট্যাব বন্ধ করে আবার চেষ্টা করুন।"));
  }).catch((error) => { database = undefined; throw error; });
  return database;
}
async function stateTransaction<T>(write: boolean, action: (state: State, files: IDBObjectStore) => T): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(["data", "files"], write ? "readwrite" : "readonly");
    let value: T, failure: unknown;
    const req = tx.objectStore("data").get("catalog");
    req.onsuccess = () => { try { const state: State = req.result || initial(); value = action(state, tx.objectStore("files")); if (write) tx.objectStore("data").put(state, "catalog"); } catch (e) { failure = e; tx.abort(); } };
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(failure || new Error("ডেমোর পরিবর্তন সেভ হয়নি। ব্রাউজারের স্টোরেজ পূর্ণ বা বন্ধ থাকতে পারে।"));
  });
}
function changed() {
  window.dispatchEvent(new Event(demoCatalogEvent));
  try { localStorage.setItem(demoRevisionKey, crypto.randomUUID()); } catch { /* Same-tab updates still work. */ }
}
export function demoAdminSignedIn() { try { return sessionStorage.getItem(sessionKey) === "active"; } catch { return false; } }
export async function enterDemoAdmin() { await stateTransaction(true, () => undefined); sessionStorage.setItem(sessionKey, "active"); }
export function leaveDemoAdmin() { sessionStorage.removeItem(sessionKey); }
function requireAdmin() { if (!demoAdminSignedIn()) throw new Error("আগে ডেমো অ্যাডমিনে প্রবেশ করুন।"); }
async function assetUrl(id: string) {
  if (urls.has(id)) return urls.get(id)!;
  const db = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => { const req = db.transaction("files").objectStore("files").get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error("ডেমোর ফাইলটি খোলা যায়নি।")); });
  if (!blob) return "";
  if (urls.has(id)) return urls.get(id)!;
  const url = URL.createObjectURL(blob); urls.set(id, url); return url;
}
async function decorate(product: Product, publicView: boolean) {
  const p = structuredClone(product);
  const ids = [p.coverAssetId, ...(p.galleryAssetIds || [])].filter((id): id is string => !!id);
  p.demoAssetUrls = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await assetUrl(id)])));
  if (publicView) { delete p.previewPermissionNote; delete p.stockCost; if (!p.previewPermission) p.previewAssetIds = []; }
  return p;
}
function recordStock(state: State, productId: string, before: number, after: number, requestId?: string, added?: number) {
  state.history.push({ id: `history-${crypto.randomUUID()}`, productId, actorName: "ডেমো অ্যাডমিন", at: new Date().toISOString(), change: { before, after, added }, requestId, added });
  state.history = state.history.slice(-500);
}
function saveBook(state: State, input: unknown, id: string, exists: boolean) {
  const old = state.products.find((p) => p.id === id);
  if (exists && !old) throw new Error("বইটি পাওয়া যায়নি");
  if (!exists && state.products.length >= 500) throw new Error("ডেমোতে সর্বোচ্চ ৫০০টি বই রাখা যাবে।");
  const parsed = productSchema.safeParse({ ...(input as object), id });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const p = parsed.data;
  if (state.products.some((book) => book.id !== id && book.slug === p.slug)) throw new Error("এই slug আগে ব্যবহার করা হয়েছে");
  const findAsset = (id: string, kinds: Asset["kind"][]) => { const asset = state.assets.find((a) => a.id === id && kinds.includes(a.kind) && a.productId === p.id); if (!asset) throw new Error("বইয়ের আপলোড করা ফাইলটি পাওয়া যায়নি বা অনুমতি নেই"); return asset; };
  if (p.coverAssetId) findAsset(p.coverAssetId, ["cover", "gallery"]);
  for (const id of p.galleryAssetIds) findAsset(id, ["gallery", "cover"]);
  const previews = p.previewAssetIds.map((id) => findAsset(id, ["preview"]));
  if (new Set(p.previewAssetIds).size !== previews.length || (previews.some((a) => a.mime === "application/pdf") && previews.length > 1)) throw new Error("একটি PDF অথবা ছবির পৃষ্ঠাগুলো বেছে নিন");
  if (previews.length && previews.reduce((n, a) => n + a.pages, 0) >= p.pages) throw new Error("নমুনা পৃষ্ঠার সংখ্যা সম্পূর্ণ বইয়ের চেয়ে কম হতে হবে");
  if (p.previewPermission && previews.length && (p.previewPermissionNote || "").trim().length < 5) throw new Error("প্রিভিউ প্রকাশের অনুমতির বিবরণ লিখুন");
  if (old) state.products[state.products.indexOf(old)] = p; else state.products.push(p);
  if ((old?.stock || 0) !== p.stock) recordStock(state, id, old?.stock || 0, p.stock);
  return p;
}
export async function browserDemoRequest(path: string, options?: RequestInit): Promise<{ handled: boolean; value?: unknown }> {
  const url = new URL(path, "https://browser-demo.invalid"), parts = url.pathname.split("/").filter(Boolean), method = (options?.method || "GET").toUpperCase();
  const answer = (value: unknown) => ({ handled: true, value });
  if (parts[0] === "admin") {
    requireAdmin();
    const state = await stateTransaction(false, (s) => s);
    if (path === "/admin/access" && method === "GET") return answer({ role: "catalog", permissions: ["catalog"], demo: true, storage: "browser" });
    if (path === "/admin/catalog" && method === "GET") return answer({ products: await Promise.all(state.products.map((p) => decorate(p, false))), assets: await Promise.all(state.assets.map(async (a) => ({ ...a, url: await assetUrl(a.id) }))) });
    if (parts[1] === "products") {
      const id = parts[2] ? decodeURIComponent(parts[2]) : "";
      const product = state.products.find((p) => p.id === id);
      if (parts.length === 3 && method === "GET") {
        if (!product) throw new Error("বইটি পাওয়া যায়নি");
        return answer({ product: await decorate(product, false), assets: await Promise.all(state.assets.filter((a) => a.productId === id).map(async (a) => ({ ...a, url: await assetUrl(a.id) }))) });
      }
      if (parts.length === 4 && parts[3] === "stock-history" && method === "GET") return answer({ entries: state.history.filter((h) => h.productId === id).reverse() });
      if ((parts.length === 2 && method === "POST") || (parts.length === 3 && method === "PUT")) {
        const body = JSON.parse(String(options?.body || "{}"));
        const saved = await stateTransaction(true, (s) => saveBook(s, body, id || `book-demo-${crypto.randomUUID()}`, method === "PUT"));
        changed(); return answer({ product: await decorate(saved, false) });
      }
      if (parts.length === 4 && parts[3] === "stock" && method === "POST") {
        const input = JSON.parse(String(options?.body || "{}"));
        if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000 || typeof input.requestId !== "string") throw new Error("সঠিক কপির সংখ্যা দিন।");
        const saved = await stateTransaction(true, (s) => {
          const p = s.products.find((p) => p.id === id); if (!p) throw new Error("বইটি পাওয়া যায়নি");
          const old = s.history.find((h) => h.requestId === input.requestId);
          if (old) { if (old.productId !== id || old.added !== input.quantity) throw new Error("এই অনুরোধটি আগে ব্যবহৃত হয়েছে।"); return p; }
          if (p.stock + input.quantity > 100000) throw new Error("মোট স্টক ১০০০০০ কপির বেশি হতে পারে না।");
          const before = p.stock; p.stock += input.quantity; recordStock(s, id, before, p.stock, input.requestId, input.quantity); return p;
        }); changed(); return answer({ product: await decorate(saved, false) });
      }
    }
    throw new Error("এই ডেমো অ্যাডমিনে বই যোগ, সম্পাদনা ও স্টক পরীক্ষা করা যায়। অন্য বিভাগ চালু নেই।");
  }
  if (method !== "GET") return { handled: false };
  if (parts[0] === "products") {
    const state = await stateTransaction(false, (s) => s);
    if (parts.length === 2) { const p = state.products.find((p) => p.slug === decodeURIComponent(parts[1])); if (!p) throw new Error("বইটি পাওয়া যায়নি"); return answer({ product: await decorate(p, true) }); }
    const q = (url.searchParams.get("q") || "").trim().toLowerCase(), category = url.searchParams.get("category") || "all";
    const products = state.products.filter((p) => (category === "all" || p.category === category) && (!q || `${p.title} ${p.author} ${p.publisher} ${p.isbn || ""}`.toLowerCase().includes(q)));
    if (url.searchParams.get("sort") === "price-asc") products.sort((a, b) => a.price - b.price);
    if (url.searchParams.get("sort") === "price-desc") products.sort((a, b) => b.price - a.price);
    return answer({ products: await Promise.all(products.map((p) => decorate(p, true))) });
  }
  if (parts[0] === "books" && ["preview", "reviews"].includes(parts[2])) {
    const state = await stateTransaction(false, (s) => s), p = state.products.find((p) => p.id === parts[1]);
    if (!p) throw new Error("বইটি পাওয়া যায়নি");
    if (parts[2] === "reviews") return answer({ reviews: [], ownReview: null, eligible: false });
    return answer({ assets: p.previewPermission ? await Promise.all(state.assets.filter((a) => (p.previewAssetIds || []).includes(a.id)).sort((a, b) => p.previewAssetIds!.indexOf(a.id) - p.previewAssetIds!.indexOf(b.id)).map(async (a) => ({ ...a, url: await assetUrl(a.id) }))) : [] });
  }
  return { handled: false };
}
export async function browserDemoUpload(file: File, kind: Asset["kind"], productId?: string): Promise<Asset> {
  requireAdmin();
  if (!productId || !["cover", "gallery", "preview"].includes(kind)) throw new Error("এই ডেমোতে শুধু বইয়ের প্রচ্ছদ, ছবি ও প্রিভিউ আপলোড করা যায়।");
  if (file.size > 10 * 1024 * 1024) throw new Error("ফাইল সর্বোচ্চ ১০ মেগাবাইট হতে পারে");
  let blob: Blob = file, pages = 1;
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error("ছবিটি খোলা যাচ্ছে না।"); });
    try {
      if (bitmap.width * bitmap.height > 40000000) throw new Error("ছবির মাপ অনেক বড়। ছোট ছবি দিন।");
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d"); if (!context) throw new Error("ছবি প্রস্তুত করা যায়নি।"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("ছবি প্রস্তুত করা যায়নি।")), "image/webp", .85));
    } finally { bitmap.close(); }
  } else if (file.type === "application/pdf" && kind === "preview") {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await file.arrayBuffer()).catch(() => { throw new Error("PDF খোলা যায়নি বা পাসওয়ার্ড দেওয়া আছে।"); });
    pages = pdf.getPageCount(); if (pages < 1 || pages > 30) throw new Error("প্রিভিউ PDF সর্বোচ্চ ৩০ পৃষ্ঠা হতে পারে।");
  } else throw new Error("JPEG, PNG, WebP ছবি বা প্রিভিউ PDF দিন।");
  const asset: Asset = { id: `asset-demo-${crypto.randomUUID()}`, filename: file.name.slice(0, 150), kind, productId, mime: blob.type, size: blob.size, pages, createdAt: new Date().toISOString() };
  await stateTransaction(true, (s, files) => { if (!s.products.some((p) => p.id === productId)) throw new Error("প্রথমে বইটি সেভ করুন।"); s.assets.push(asset); files.put(blob, asset.id); });
  return { ...asset, url: await assetUrl(asset.id) };
}
export async function resetBrowserDemo() {
  await stateTransaction(true, (s, files) => { Object.assign(s, initial()); files.clear(); });
  for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); changed();
}
