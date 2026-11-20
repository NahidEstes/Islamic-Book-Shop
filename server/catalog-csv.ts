import { createHash } from "node:crypto";
import type { Product } from "../lib/types";
import type { ShopData } from "../lib/commerce-types";
import { productSchema } from "../lib/validation";
import { makeCsv, parseCsv } from "../lib/csv";
import { id, StoreError, type Store } from "./store";
import { audit, type CommerceService } from "./commerce";

export const catalogColumns = ["id", "slug", "title", "author", "publisher", "category", "price", "originalPrice", "stock", "pages", "language", "edition", "binding", "featured", "coverTheme", "description", "isbn", "publicationYear", "lowStockThreshold", "subtitle", "translator", "editor", "tags", "contents", "sample"] as const;
const numeric = new Set(["price", "originalPrice", "stock", "pages", "publicationYear", "lowStockThreshold"]);
const defaults = { stock: 0, pages: 1, language: "বাংলা", edition: "প্রথম", binding: "পেপারব্যাক", featured: false, coverTheme: "sage", contents: [], tags: [], sample: false };
const fingerprint = (data: ShopData) => createHash("sha256").update(JSON.stringify(data.products)).digest("hex");
export function previewCatalog(data: ShopData, csv: string) {
  if (Buffer.byteLength(csv, "utf8") > 512000) throw new StoreError("CSV ফাইল সর্বোচ্চ ৫০০ KB হতে পারবে।", 413);
  let parsed: string[][];
  try { parsed = parseCsv(csv); } catch (e) { throw new StoreError((e as Error).message); }
  if (parsed.length < 2) throw new StoreError("হেডার ও অন্তত একটি বইয়ের সারি প্রয়োজন।");
  const headers = parsed[0].map((v) => v.trim());
  if (new Set(headers).size !== headers.length || headers.some((h) => !catalogColumns.includes(h as typeof catalogColumns[number]))) throw new StoreError("CSV কলামের নাম সঠিক নয়। টেমপ্লেট ব্যবহার করুন।");
  const proposed: Product[] = [];
  const seenIds = new Set<string>(), seenSlugs = new Set<string>();
  const rows = parsed.slice(1).map((cells, index) => {
    const row = index + 2;
    let title = "", action = "create";
    try {
      if (cells.length !== headers.length) throw new Error("কলামের সংখ্যা হেডারের সঙ্গে মিলছে না।");
      const values: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i], value = cells[i].trim();
        if (numeric.has(key)) { if (!value && key === "publicationYear") values[key] = undefined; else if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${key}: পূর্ণ সংখ্যা দিন।`); else values[key] = Number(value); }
        else if (["featured", "sample"].includes(key)) { if (!["true", "false"].includes(value)) throw new Error(`${key}: true বা false দিন।`); values[key] = value === "true"; }
        else if (["tags", "contents"].includes(key)) values[key] = value ? value.split("|").map((v) => v.trim()) : [];
        else values[key] = value;
      }
      title = String(values.title || values.id || "");
      const old = values.id ? data.products.find((p) => p.id === values.id) : undefined;
      if (values.id && !old) throw new Error("এই ID পাওয়া যায়নি। নতুন বইয়ের ID খালি রাখুন।");
      action = old ? "update" : "create";
      const productId = old?.id || id("book");
      const book = productSchema.parse({ ...defaults, ...old, ...values, id: productId });
      if (seenIds.has(productId) || seenSlugs.has(book.slug)) throw new Error("একই ID বা slug একাধিক সারিতে আছে।");
      if (data.products.some((p) => p.id !== book.id && p.slug === book.slug)) throw new Error("এই slug অন্য বইয়ে ব্যবহার হয়েছে।");
      seenIds.add(productId); seenSlugs.add(book.slug); proposed.push(book);
      return { row, title: book.title, action, price: book.price, stock: book.stock, error: "" };
    } catch (error) { return { row, title, action, error: error instanceof Error && "issues" in error ? (error as { issues: { path: string[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (error as Error).message }; }
  });
  return { rows, proposed, fingerprint: fingerprint(data), valid: rows.every((r) => !r.error), creates: rows.filter((r) => !r.error && r.action === "create").length, updates: rows.filter((r) => !r.error && r.action === "update").length };
}
export class CatalogCsvService {
  constructor(private store: Store, private commerce: CommerceService) {}
  async preview(csv: string) { const { proposed: _private, ...preview } = previewCatalog(await this.store.snapshot(), csv); return preview; }
  async export() {
    const data = await this.store.snapshot();
    return makeCsv([Array.from(catalogColumns), ...data.products.map((p) => catalogColumns.map((column) => { const value = p[column]; return Array.isArray(value) ? value.join("|") : value; }))]);
  }
  commit(csv: string, expected: string, requestId: string, actor: string) {
    const hash = createHash("sha256").update(csv).digest("hex");
    return this.store.transaction((data) => {
      const old = data.imports.find((batch) => batch.actor === actor && batch.requestId === requestId);
      if (old) { if (old.hash !== hash) throw new StoreError("এই import অনুরোধটি আগে ব্যবহৃত হয়েছে।", 409); return old; }
      if (fingerprint(data) !== expected) throw new StoreError("ক্যাটালগ ইতিমধ্যে বদলেছে। নতুন প্রিভিউ দেখুন।", 409);
      const result = previewCatalog(data, csv);
      if (!result.valid) throw new StoreError("ভুল সারিগুলো ঠিক করে আবার প্রিভিউ দেখুন।");
      for (const book of result.proposed) this.commerce.saveProductInState(data, book, actor);
      const batch = { id: id("import"), requestId, actor, hash, count: result.proposed.length, createdAt: new Date().toISOString() };
      data.imports.push(batch); audit(data, actor, "catalog.import", batch.id); return batch;
    });
  }
}
