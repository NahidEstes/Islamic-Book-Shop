import { Router, type RequestHandler } from "express";
import multer from "multer";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { PublicUser } from "../lib/commerce-types";
import { rolePermissions } from "../lib/commerce-types";
import { audit } from "./commerce";
import { id, StoreError, type Store } from "./store";

export function mediaRouter(store: Store, permission: RequestHandler, rootDirectory: string, inventoryPermission: RequestHandler) {
  const router = Router(); const root = path.resolve(rootDirectory);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, parts: 4 } });
  const saveAsset: RequestHandler = async (req, res) => {
    const file = req.file; if (!file) throw new StoreError("ফাইল নির্বাচন করুন");
    const input = z.object({ kind: z.enum(["cover", "gallery", "preview", "collection", "receipt"]), productId: z.string().regex(/^[\w-]{1,80}$/).optional() }).parse(req.body);
    if (input.kind === "receipt" && req.path !== "/admin/inventory/receipts") throw new StoreError("এই কাজের অনুমতি নেই।", 403);
    let bytes = file.buffer; let mime = "image/webp"; let extension = "webp"; let pages = 1;
    if (!["collection", "receipt"].includes(input.kind) && !input.productId) throw new StoreError("আগে বইটি সংরক্ষণ করুন এবং বইয়ের পরিচয় দিন");
    if (file.mimetype === "application/pdf") {
      if (!["preview", "receipt"].includes(input.kind) || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new StoreError("শুধু নমুনা পড়ার জন্য বৈধ PDF আপলোড করুন");
      try { const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false }); pages = pdf.getPageCount(); } catch { throw new StoreError("PDF খোলা যাচ্ছে না; এনক্রিপ্ট করা বা অকার্যকর ফাইল গ্রহণযোগ্য নয়"); }
      if (pages < 1) throw new StoreError("PDF খোলা যাচ্ছে না; এনক্রিপ্ট করা বা অকার্যকর ফাইল গ্রহণযোগ্য নয়");
      if (input.kind === "preview" && pages > 30) throw new StoreError("নমুনা PDF-এ সর্বোচ্চ ৩০ পৃষ্ঠা রাখা যাবে");
      mime = "application/pdf"; extension = "pdf";
    } else {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) throw new StoreError("JPEG, PNG, WebP অথবা নমুনা PDF দিন");
      try {
        const image = sharp(bytes, { limitInputPixels: 32000000, failOn: "error" }); const metadata = await image.metadata();
        if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || `image/${metadata.format}` !== file.mimetype || (metadata.pages || 1) > 1) throw new Error("Unsupported image");
        if (input.kind === "receipt") {
          await image.clone().resize(1, 1).toBuffer();
          mime = file.mimetype; extension = metadata.format;
        }
        else bytes = await image.rotate().resize({ width: 2200, height: 3200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
      } catch { throw new StoreError("ছবির ফরম্যাট বা বিষয়বস্তু সঠিক নয়"); }
    }
    const assetId = id("asset"); const filename = `${assetId}.${extension}`; const diskPath = path.join(root, filename);
    await mkdir(root, { recursive: true }); await writeFile(diskPath, bytes, { mode: 0o600 });
    try {
      const asset = await store.transaction((d) => {
        if (input.productId && !d.products.some((p) => p.id === input.productId)) throw new StoreError("আগে বইটি সংরক্ষণ করুন", 404);
        const created = { id: assetId, filename, kind: input.kind, mime, size: bytes.length, pages, productId: input.productId, createdAt: new Date().toISOString() };
        d.assets.push(created); audit(d, res.locals.actor as string, "media.upload", assetId); return created;
      });
      res.status(201).json({ asset });
    } catch (error) { await unlink(diskPath).catch(() => {}); throw error; }
  };
  router.post("/admin/media", permission, upload.single("file"), saveAsset);
  router.post("/admin/inventory/receipts", inventoryPermission, upload.single("file"), (req, _res, next) => {
    req.body.kind = "receipt"; next();
  }, saveAsset);
  router.get("/admin/inventory/receipts/:id", inventoryPermission, async (req, res) => {
    const asset = (await store.snapshot()).assets.find((item) => item.id === req.params.id && item.kind === "receipt");
    if (!asset || path.basename(asset.filename) !== asset.filename) throw new StoreError("ফাইল পাওয়া যায়নি", 404);
    const bytes = await readFile(path.join(root, asset.filename)).catch(() => { throw new StoreError("ফাইল পাওয়া যায়নি", 404); });
    res.set("Cache-Control", "private, no-store").json({ mime: asset.mime, filename: asset.filename, base64: bytes.toString("base64") });
  });
  router.get("/media/:id", async (req, res) => {
    const d = await store.snapshot(); const asset = d.assets.find((a) => a.id === req.params.id); if (!asset) throw new StoreError("ফাইল পাওয়া যায়নি", 404);
    if (asset.kind === "receipt") throw new StoreError("ফাইল পাওয়া যায়নি", 404);
    const publicImage = d.products.some((p) => p.coverAssetId === asset.id || p.galleryAssetIds?.includes(asset.id)) || d.collections.some((c) => c.published && c.imageAssetId === asset.id);
    const publicPreview = asset.kind === "preview" && d.products.some((p) => p.previewPermission && p.previewAssetIds?.includes(asset.id));
    const user = res.locals.user as PublicUser | null;
    if (!publicImage && !publicPreview && !(user && rolePermissions[user.role].includes("catalog"))) throw new StoreError("ফাইল পাওয়া যায়নি", 404);
    const filename = path.resolve(root, asset.filename);
    if (!filename.startsWith(root + path.sep) || path.basename(asset.filename) !== asset.filename) throw new StoreError("ফাইল পাওয়া যায়নি", 404);
    res.set({ "Content-Type": asset.mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, no-store", "Content-Disposition": "inline" });
    res.sendFile(filename, (error) => { if (error && !res.headersSent) res.status(404).json({ error: "ফাইল পাওয়া যায়নি" }); });
  });
  router.delete("/admin/media/:id", permission, async (req, res) => {
    const removed = await store.transaction((d) => {
      const a = d.assets.find((a) => a.id === req.params.id); if (!a) throw new StoreError("ফাইল পাওয়া যায়নি", 404);
      if (a.kind === "receipt") throw new StoreError("এই কাজের অনুমতি নেই।", 403);
      if (d.products.some((p) => p.coverAssetId === a.id || p.galleryAssetIds?.includes(a.id) || p.previewAssetIds?.includes(a.id)) || d.collections.some((c) => c.imageAssetId === a.id)) throw new StoreError("ব্যবহৃত ফাইল সরাতে আগে বই বা সংগ্রহ থেকে বিচ্ছিন্ন করুন", 409);
      d.assets = d.assets.filter((r) => r.id !== a.id); audit(d, res.locals.actor as string, "media.delete", a.id); return a;
    });
    const target = path.resolve(root, removed.filename); if (target.startsWith(root + path.sep)) await unlink(target).catch(() => {});
    res.json({ ok: true });
  });
  return router;
}
