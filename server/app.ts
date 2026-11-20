import express, { type ErrorRequestHandler, type RequestHandler, type Request } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { z, ZodError } from "zod";
import { orderSchema, phoneSchema, productSchema } from "../lib/validation";
import { registerSchema, loginSchema, emailSchema, passwordSchema, addressSchema, reviewSchema, collectionSchema, returnSchema } from "../lib/commerce-validation";
import { rolePermissions, roles, type PublicUser, type Permission } from "../lib/commerce-types";
import { StoreError, type Store, id, buildOrder } from "./store";
import { AuthService, publicUser, verifyPassword, hashPassword } from "./auth";
import { audit, CommerceService, findUser, ownOrder } from "./commerce";
import { flushOutbox, smtpMailer, type Mailer } from "./mail";
import { mediaRouter } from "./media";
import { salePrice } from "../lib/availability";
import { StaffService } from "./staff";
import { InventoryService } from "./inventory";
import { adjustmentSchema, purchaseDueDateSchema, purchaseSchema, receivingSchema, supplierPaymentSchema, supplierSchema } from "../lib/inventory-validation";
import { publicOrder, publicProduct, publicReturn } from "../lib/stock-cost";
import { applyCoupon, CouponService, couponSchema } from "./coupons";
import { ReportService, expenseSchema, openingCostSchema } from "./reports";
import { CatalogCsvService } from "./catalog-csv";

export type AppOptions = { appUrl?: string; uploadDir?: string; production?: boolean; mailer?: Mailer };
const sessionCookie = "noor_session";
function readCookie(req: Request) { return req.headers.cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1); }
export function createApp(store: Store, adminKey = "", options: AppOptions = {}) {
  const app = express(); const auth = new AuthService(store); const appUrl = options.appUrl || process.env.PUBLIC_APP_URL || "http://localhost:3000";
  const production = options.production ?? process.env.NODE_ENV === "production"; const mailer = options.mailer || smtpMailer(); const commerce = new CommerceService(store, mailer, appUrl);
  const staff = new StaffService(store, mailer, appUrl);
  const inventory = new InventoryService(store, commerce);
  const coupons = new CouponService(store), reports = new ReportService(store), csv = new CatalogCsvService(store, commerce);
  app.locals.commerce = commerce; app.locals.flushOutbox = () => flushOutbox(store, mailer);
  app.disable("x-powered-by"); app.set("trust proxy", "loopback"); app.use(helmet());
  app.use("/api/admin/catalog/import", express.json({ limit: "1mb" }));
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && ((req.get("origin") && req.get("origin") !== new URL(appUrl).origin) || req.get("sec-fetch-site") === "cross-site")) { res.status(403).json({ error: "এই উৎস থেকে অনুরোধ অনুমোদিত নয়" }); return; } next();
  });
  app.use(async (req, res, next) => { res.locals.user = await auth.resolve(readCookie(req)); next(); });
  const limit = (count: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit: count, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।" } });
  const authLimit = limit(30), sensitiveLimit = limit(80), adminLimit = limit(400);
  const requireUser: RequestHandler = (_req, res, next) => { if (!res.locals.user) { res.status(401).json({ error: "আগে আপনার অ্যাকাউন্টে লগইন করুন" }); return; } next(); };
  const currentUser = (res: express.Response) => res.locals.user as PublicUser;
  const admin: RequestHandler = (req, res, next) => {
    const supplied = req.get("authorization")?.replace(/^Bearer /, "");
    if (supplied) {
      if (adminKey.length < 24) { res.status(503).json({ error: "অ্যাডমিন কী কনফিগার করা হয়নি" }); return; }
      const digest = (s: string) => createHash("sha256").update(s).digest();
      if (!timingSafeEqual(digest(supplied), digest(adminKey))) { res.status(401).json({ error: "অ্যাডমিন কী সঠিক নয়" }); return; }
      res.locals.actor = "bootstrap-owner"; res.locals.permissions = rolePermissions.owner; res.locals.role = "owner";
    } else {
      const u = currentUser(res);
      if (!u || !rolePermissions[u.role].length) { res.status(401).json({ error: "স্টোর পরিচালনার অনুমতি নেই" }); return; }
      res.locals.actor = u.id; res.locals.permissions = rolePermissions[u.role]; res.locals.role = u.role;
    } next();
  };
  const allow = (permission: Permission): RequestHandler => (_req, res, next) => { if (!(res.locals.permissions as Permission[] | undefined)?.includes(permission)) { res.status(403).json({ error: "এই কাজের অনুমতি আপনার ভূমিকায় নেই" }); return; } next(); };
  app.use("/api/admin", adminLimit, admin);
  app.get("/api/health", (_req, res) => res.json({ ok: true, demo: store.demo, database: store.constructor.name === "MongoStore" ? "mongodb" : "local-demo" }));
  app.get("/api/config", (_req, res) => res.json({ demo: store.demo, emailAvailable: mailer.available, paymentMethods: ["cod"], delivery: { dhaka: 60, outside: 120 } }));
  app.get("/api/products", async (req, res) => {
    let products = await commerce.catalog(); const q = typeof req.query.q === "string" ? req.query.q.toLowerCase().trim() : ""; const category = typeof req.query.category === "string" ? req.query.category : "all";
    if (q) products = products.filter((p) => `${p.title} ${p.author} ${p.publisher} ${p.translator || ""} ${p.isbn || ""} ${(p.tags || []).join(" ")}`.toLowerCase().includes(q));
    if (category !== "all") products = products.filter((p) => p.category === category);
    if (req.query.sort === "price-asc") products.sort((a, b) => salePrice(a) - salePrice(b)); if (req.query.sort === "price-desc") products.sort((a, b) => salePrice(b) - salePrice(a));
    res.json({ products });
  });
  app.get("/api/products/:slug", async (req, res) => { const product = (await commerce.catalog()).find((p) => p.slug === req.params.slug); if (!product) throw new StoreError("বইটি পাওয়া যায়নি", 404); res.json({ product }); });
  app.get("/api/books/:id/preview", async (req, res) => { const d = await store.snapshot(); const p = d.products.find((p) => p.id === req.params.id); if (!p) throw new StoreError("বইটি পাওয়া যায়নি", 404); res.json({ assets: p.previewPermission ? (p.previewAssetIds || []).map((assetId) => d.assets.find((a) => a.id === assetId)).filter((a) => !!a).map((a) => ({ id: a!.id, mime: a!.mime, pages: a!.pages, url: `/api/media/${a!.id}` })) : [] }); });
  app.get("/api/books/:id/reviews", async (req, res) => res.json(await commerce.reviews(String(req.params.id), currentUser(res)?.id)));
  app.post("/api/books/:id/reviews", sensitiveLimit, requireUser, async (req, res) => res.status(201).json({ review: await commerce.review(currentUser(res).id, String(req.params.id), reviewSchema.parse(req.body)) }));
  app.get("/api/collections", async (_req, res) => res.json({ collections: (await store.snapshot()).collections.filter((c) => c.published).sort((a, b) => a.sortOrder - b.sortOrder) }));
  app.get("/api/collections/:slug", async (req, res) => { const collection = (await store.snapshot()).collections.find((c) => c.slug === req.params.slug && c.published); if (!collection) throw new StoreError("সংগ্রহ পাওয়া যায়নি", 404); res.json({ collection }); });

  app.use("/api/auth", authLimit);
  app.post("/api/auth/accept-invite", async (req, res) => {
    const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }).parse(req.body);
    res.json(await staff.accept(input.token, input.password));
  });
  app.post("/api/auth/register", async (req, res) => { const input = registerSchema.parse(req.body); const user = await auth.register(input); const login = await auth.login(input.email, input.password); res.cookie(sessionCookie, login.raw, { httpOnly: true, secure: production, sameSite: "lax", path: "/", expires: new Date(login.expiresAt) }); const delivery = await commerce.identityEmail(user.id, "verify"); res.status(201).json({ user, ...delivery }); });
  app.post("/api/auth/login", async (req, res) => { const i = loginSchema.parse(req.body); const result = await auth.login(i.email, i.password); res.cookie(sessionCookie, result.raw, { httpOnly: true, secure: production, sameSite: "lax", path: "/", expires: new Date(result.expiresAt) }); res.json({ user: result.user }); });
  app.get("/api/auth/me", (_req, res) => res.json({ user: res.locals.user || null }));
  app.post("/api/auth/logout", async (req, res) => { await auth.logout(readCookie(req)); res.clearCookie(sessionCookie, { httpOnly: true, secure: production, sameSite: "lax", path: "/" }); res.json({ ok: true }); });
  app.post("/api/auth/forgot", async (req, res) => { const email = emailSchema.parse(req.body.email); const u = (await store.snapshot()).users.find((u) => u.email === email && !u.disabled); if (u) await commerce.identityEmail(u.id, "reset"); res.json({ deliveryAvailable: mailer.available, message: mailer.available ? "অ্যাকাউন্ট থাকলে পুনরুদ্ধারের ইমেইল পাঠানোর জন্য কিউতে রাখা হয়েছে।" : "ইমেইল সেবা যুক্ত না থাকায় পাসওয়ার্ড পুনরুদ্ধার এখন চালু নেই।" }); });
  app.post("/api/auth/reset", async (req, res) => { const i = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }).parse(req.body); res.json(await auth.reset(i.token, i.password, "reset")); });
  app.post("/api/auth/verify", async (req, res) => { const token = z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.token); res.json(await auth.reset(token, "", "verify")); });
  app.post("/api/auth/send-verification", requireUser, async (_req, res) => res.json(await commerce.identityEmail(currentUser(res).id, "verify")));
  app.post("/api/auth/change-password", requireUser, async (req, res) => {
    const i = z.object({ currentPassword: z.string().max(128), password: passwordSchema }).parse(req.body); const before = findUser(await store.snapshot(), currentUser(res).id);
    if (!await verifyPassword(i.currentPassword, before.passwordHash)) throw new StoreError("বর্তমান পাসওয়ার্ড সঠিক নয়", 400);
    const passwordHash = await hashPassword(i.password);
    await store.transaction((d) => { const u = findUser(d, before.id); if (u.passwordHash !== before.passwordHash) throw new StoreError("আবার চেষ্টা করুন", 409); u.passwordHash = passwordHash; d.sessions = d.sessions.filter((s) => s.userId !== u.id); d.tokens = d.tokens.filter((t) => t.userId !== u.id); });
    res.clearCookie(sessionCookie, { path: "/" }); res.json({ ok: true });
  });
  app.use("/api/account", requireUser, sensitiveLimit);
  app.get("/api/account", async (_req, res) => res.json(await commerce.account(currentUser(res).id)));
  app.patch("/api/account", async (req, res) => { const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body); const user = await store.transaction((d) => { const u = findUser(d, currentUser(res).id); u.name = name; return publicUser(u); }); res.json({ user }); });
  app.put("/api/account/addresses", async (req, res) => { const input = addressSchema.parse(req.body); const address = await store.transaction((d) => { const u = findUser(d, currentUser(res).id); if (input.id && !u.addresses.some((a) => a.id === input.id)) throw new StoreError("ঠিকানা পাওয়া যায়নি", 404); const a = { ...input, id: input.id || id("address") }; const index = u.addresses.findIndex((v) => v.id === a.id); if (index >= 0) u.addresses[index] = a; else { if (u.addresses.length >= 10) throw new StoreError("সর্বোচ্চ ১০টি ঠিকানা রাখা যাবে"); u.addresses.push(a); } return a; }); res.json({ address }); });
  app.delete("/api/account/addresses/:id", async (req, res) => { await store.transaction((d) => { const u = findUser(d, currentUser(res).id); u.addresses = u.addresses.filter((a) => a.id !== req.params.id); }); res.json({ ok: true }); });
  app.post("/api/account/orders/:id/reorder", async (req, res) => { const d = await store.snapshot(); const o = ownOrder(d, String(req.params.id), currentUser(res).id); res.json({ items: o.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), products: await commerce.catalog() }); });
  app.put("/api/account/subscriptions/:id", async (req, res) => res.json({ subscription: await commerce.subscribe(currentUser(res).id, String(req.params.id), z.boolean().parse(req.body.active)) }));
  app.patch("/api/account/notifications/:id", async (req, res) => { await store.transaction((d) => { const n = d.notifications.find((n) => n.id === req.params.id && n.userId === currentUser(res).id); if (!n) throw new StoreError("বার্তা পাওয়া যায়নি", 404); n.read = true; }); res.json({ ok: true }); });
  app.post("/api/account/returns", async (req, res) => res.status(201).json({ request: await commerce.requestReturn(currentUser(res).id, returnSchema.parse(req.body)) }));
  app.patch("/api/account/returns/:id/withdraw", async (req, res) => { await store.transaction((d) => { const r = d.returns.find((r) => r.id === req.params.id && r.userId === currentUser(res).id); if (!r || r.status !== "requested") throw new StoreError("অনুরোধ প্রত্যাহার করা যাবে না", 409); r.status = "withdrawn"; }); res.json({ ok: true }); });
  app.post("/api/orders/quote", sensitiveLimit, async (req, res) => {
    const input = orderSchema.parse({ customer: { name: "Quote preview", phone: "01700000000", address: "Quote preview address", city: "Dhaka", zone: req.body.zone }, items: req.body.items, couponCode: req.body.couponCode, acceptPreorderTerms: true, paymentMethod: "cod" });
    const data = await store.snapshot(); const order = buildOrder(data.products, input, store.demo);
    if (input.couponCode) applyCoupon(data, order, input.couponCode);
    res.set("Cache-Control", "no-store").json({ subtotal: order.subtotal, delivery: order.delivery, total: order.total, discountMinor: order.coupon?.discountMinor || 0, couponCode: order.coupon?.code || "" });
  });
  app.post("/api/orders", sensitiveLimit, async (req, res) => res.status(201).json({ order: publicOrder(await store.placeOrder(orderSchema.parse(req.body), currentUser(res)?.id)) }));
  app.post("/api/orders/lookup", sensitiveLimit, async (req, res) => { const i = z.object({ orderId: z.string().trim().min(5).max(60), phone: phoneSchema }).parse(req.body); const order = await store.findOrder(i.orderId.toUpperCase(), i.phone); if (!order) throw new StoreError("অর্ডার নম্বর ও মোবাইল নম্বর মিলিয়ে আবার চেষ্টা করুন।", 404); res.json({ order: publicOrder(order) }); });

  app.get("/api/admin/access", (_req, res) => res.json({ role: res.locals.role, permissions: res.locals.permissions }));
  app.get("/api/admin/reports", allow("reports"), async (req, res) => { const range = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query); if (range.from && range.to && range.from > range.to) throw new StoreError("তারিখের পরিসর সঠিক নয়"); res.set("Cache-Control", "private, no-store").json(await reports.report(range.from, range.to)); });
  app.post("/api/admin/reports/expenses", allow("finance"), async (req, res) => res.status(201).json({ expense: await reports.expense(expenseSchema.parse(req.body), res.locals.actor) }));
  app.post("/api/admin/reports/expenses/:id/void", allow("finance"), async (req, res) => res.json({ expense: await reports.voidExpense(String(req.params.id), res.locals.actor) }));
  app.put("/api/admin/inventory/products/:id/opening-cost", allow("inventory"), async (req, res) => { const product = await reports.openingCost(String(req.params.id), openingCostSchema.parse(req.body), res.locals.actor); res.json({ ok: true, productId: product.id }); });
  app.get("/api/admin/coupons", allow("promotions"), async (_req, res) => res.set("Cache-Control", "private, no-store").json({ coupons: await coupons.list(), products: (await store.products()).map(({ id, title }) => ({ id, title })) }));
  app.post("/api/admin/coupons", allow("promotions"), async (req, res) => res.status(201).json({ coupon: await coupons.save(couponSchema.parse(req.body), res.locals.actor) }));
  app.put("/api/admin/coupons/:id", allow("promotions"), async (req, res) => res.json({ coupon: await coupons.save(couponSchema.parse(req.body), res.locals.actor, String(req.params.id), z.number().int().parse(req.body.expectedVersion)) }));
  app.get("/api/admin/catalog/export", allow("catalog"), async (_req, res) => res.set("Cache-Control", "private, no-store").json({ csv: await csv.export() }));
  app.post("/api/admin/catalog/import/preview", allow("catalog"), async (req, res) => res.json(await csv.preview(z.string().max(512000).parse(req.body.csv))));
  app.post("/api/admin/catalog/import/commit", allow("catalog"), async (req, res) => { const input = z.object({ csv: z.string().max(512000), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid() }).parse(req.body); res.json({ batch: await csv.commit(input.csv, input.fingerprint, input.requestId, res.locals.actor) }); });
  app.get("/api/admin/dashboard", allow("reports"), async (req, res) => { const i = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query); if (i.from && i.to && i.from > i.to) throw new StoreError("তারিখের পরিসর সঠিক নয়"); res.json(await commerce.dashboard(i.from, i.to, (res.locals.permissions as Permission[]).includes("orders"))); });
  app.get("/api/admin/catalog", allow("catalog"), async (_req, res) => { const d = await store.snapshot(); res.json({ products: d.products.map(publicProduct), assets: d.assets.filter((asset) => asset.kind !== "receipt") }); });
  app.get("/api/admin/inventory", allow("inventory"), async (_req, res) => res.set("Cache-Control", "private, no-store").json(await inventory.overview()));
  app.post("/api/admin/inventory/suppliers", allow("inventory"), async (req, res) => res.status(201).json({ supplier: await inventory.saveSupplier(supplierSchema.parse(req.body), res.locals.actor) }));
  app.put("/api/admin/inventory/suppliers/:id", allow("inventory"), async (req, res) => res.json({ supplier: await inventory.saveSupplier(supplierSchema.parse(req.body), res.locals.actor, String(req.params.id)) }));
  app.post("/api/admin/inventory/purchases", allow("inventory"), async (req, res) => res.status(201).json({ purchase: await inventory.createPurchase(purchaseSchema.parse(req.body), res.locals.actor) }));
  app.put("/api/admin/inventory/purchases/:id/due-date", allow("inventory"), async (req, res) => {
    const input = purchaseDueDateSchema.parse(req.body);
    res.json({ purchase: await inventory.setDueDate(String(req.params.id), input.dueDate, input.expected, res.locals.actor) });
  });
  app.post("/api/admin/inventory/purchases/:id/receive", allow("inventory"), async (req, res) => res.json({ purchase: await inventory.receive(String(req.params.id), receivingSchema.parse(req.body), res.locals.actor) }));
  app.post("/api/admin/inventory/purchases/:id/payments", allow("inventory"), async (req, res) => res.status(201).json({ payment: await inventory.pay(String(req.params.id), supplierPaymentSchema.parse(req.body), res.locals.actor) }));
  app.post("/api/admin/inventory/adjustments", allow("inventory"), async (req, res) => res.json({ product: await inventory.adjust(adjustmentSchema.parse(req.body), res.locals.actor) }));
  app.get("/api/admin/products/:id", allow("catalog"), async (req, res) => {
    const data = await store.snapshot();
    const product = data.products.find((book) => book.id === req.params.id);
    if (!product) throw new StoreError("বইটি পাওয়া যায়নি", 404);
    const attached = new Set([product.coverAssetId, ...(product.galleryAssetIds ?? []), ...(product.previewAssetIds ?? [])]);
    res.set("Cache-Control", "private, no-store").json({ product: publicProduct(product), assets: data.assets.filter((asset) => attached.has(asset.id)) });
  });
  app.post("/api/admin/products", allow("catalog"), async (req, res) => {
    const product = await commerce.saveProduct(productSchema.parse({ ...req.body, id: id("book") }), res.locals.actor);
    res.status(201).json({ product: publicProduct(product) });
  });
  app.post("/api/admin/products/:id/stock", allow("catalog"), async (req, res) => {
    const input = z.object({
      quantity: z.number().int().min(1).max(100000),
      requestId: z.string().uuid(),
    }).parse(req.body);
    res.json({ product: publicProduct(await commerce.addStock(String(req.params.id), input.quantity, input.requestId, res.locals.actor)) });
  });
  app.get("/api/admin/products/:id/stock-history", allow("catalog"), async (req, res) => {
    res.set("Cache-Control", "private, no-store").json({ entries: await commerce.stockHistory(String(req.params.id)) });
  });
  app.get("/api/admin/orders", allow("orders"), async (_req, res) => res.json({ orders: (await store.orders()).map(publicOrder), demo: store.demo }));
  app.put("/api/admin/products/:id", allow("catalog"), async (req, res) => res.json({ product: publicProduct(await commerce.saveProduct(productSchema.parse({ ...req.body, id: req.params.id }), res.locals.actor)) }));
  app.patch("/api/admin/orders/:id", allow("orders"), async (req, res) => { const status = z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]).parse(req.body.status); res.json({ order: publicOrder(await commerce.orderStatus(String(req.params.id), status, res.locals.actor)) }); });
  app.patch("/api/admin/orders/:id/preorder-ready", allow("orders"), async (req, res) => res.json({ order: publicOrder(await commerce.readyPreorder(String(req.params.id), res.locals.actor)) }));
  app.get("/api/admin/reviews", allow("reviews"), async (_req, res) => res.json({ reviews: (await store.snapshot()).reviews.slice().reverse() }));
  app.patch("/api/admin/reviews/:id", allow("reviews"), async (req, res) => { const i = z.object({ status: z.enum(["approved", "rejected", "hidden"]), note: z.string().max(500).default("") }).parse(req.body); res.json({ review: await commerce.moderate(String(req.params.id), i.status, i.note, res.locals.actor) }); });
  app.get("/api/admin/collections", allow("collections"), async (_req, res) => res.json({ collections: (await store.snapshot()).collections }));
  app.put("/api/admin/collections/:id", allow("collections"), async (req, res) => res.json({ collection: await commerce.saveCollection(collectionSchema.parse({ ...req.body, id: req.params.id }), res.locals.actor) }));
  app.get("/api/admin/returns", allow("returns"), async (_req, res) => res.json({ returns: (await store.snapshot()).returns.slice().reverse().map(publicReturn) }));
  app.patch("/api/admin/returns/:id", allow("returns"), async (req, res) => { const i = z.object({ status: z.enum(["approved", "rejected", "received"]), restock: z.boolean().default(false), note: z.string().max(500).default("") }).parse(req.body); res.json({ request: publicReturn(await commerce.returnStatus(String(req.params.id), i.status, i.restock, i.note, res.locals.actor)) }); });
  app.get("/api/admin/finance", allow("finance"), async (_req, res) => { const d = await store.snapshot(); res.json({ payments: d.payments.slice().reverse(), refunds: d.refunds.slice().reverse() }); });
  app.post("/api/admin/payments", allow("finance"), async (req, res) => { const i = z.object({ orderId: z.string().max(80), amount: z.number().positive().max(100000000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < .00001, "সর্বোচ্চ দুই দশমিক ঘর ব্যবহার করুন।"), reference: z.string().trim().min(3).max(150), method: z.enum(["cod", "bank"]), confirmedManual: z.literal(true) }).parse(req.body); res.status(201).json({ payment: await commerce.recordPayment(i.orderId, i.amount, i.reference, i.method, res.locals.actor) }); });
  app.post("/api/admin/refunds", allow("finance"), async (req, res) => { const i = z.object({ returnId: z.string().max(80), amount: z.number().positive().max(100000000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < .00001, "সর্বোচ্চ দুই দশমিক ঘর ব্যবহার করুন।"), method: z.enum(["cash", "bank"]) }).parse(req.body); res.status(201).json({ refund: await commerce.createRefund(i.returnId, i.amount, i.method, res.locals.actor) }); });
  app.patch("/api/admin/refunds/:id", allow("finance"), async (req, res) => { const i = z.object({ status: z.enum(["completed", "cancelled"]), reference: z.string().max(150).default(""), confirmedManual: z.boolean().default(false) }).parse(req.body); res.json({ refund: await commerce.finishRefund(String(req.params.id), i.status, i.reference, i.confirmedManual, res.locals.actor) }); });
  app.get("/api/admin/staff", allow("staff"), async (_req, res) => res.set("Cache-Control", "private, no-store").json(await staff.overview()));
  app.get("/api/admin/staff/customers", allow("staff"), async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(254).default("") }).parse(req.query);
    res.set("Cache-Control", "private, no-store").json(await staff.customers(q));
  });
  app.post("/api/admin/staff/invitations", allow("staff"), async (req, res) => {
    const input = registerSchema.omit({ password: true }).extend({ role: z.enum(["owner", "manager", "catalog", "orders"]) }).parse(req.body);
    res.status(201).json(await staff.invite(input, res.locals.actor));
  });
  app.post("/api/admin/staff/invitations/:id/resend", allow("staff"), async (req, res) => {
    res.json(await staff.resend(String(req.params.id), res.locals.actor));
  });
  app.get("/api/admin/staff/:id", allow("staff"), async (req, res) => {
    res.set("Cache-Control", "private, no-store").json(await staff.detail(String(req.params.id)));
  });
  app.post("/api/admin/staff/:id/revoke-sessions", allow("staff"), async (req, res) => {
    res.json(await staff.revokeSessions(String(req.params.id), res.locals.actor));
  });
  app.post("/api/admin/staff", allow("staff"), async (req, res) => { const i = registerSchema.extend({ role: z.enum(["owner", "manager", "catalog", "orders"]) }).parse(req.body); res.status(201).json({ user: await commerce.staff(i, res.locals.actor) }); });
  app.patch("/api/admin/staff/:id", allow("staff"), async (req, res) => {
    const input = z.object({ role: z.enum(roles), disabled: z.boolean(), expected: z.object({ role: z.enum(roles), disabled: z.boolean() }).optional() }).parse(req.body);
    res.json({ user: await commerce.updateStaff(String(req.params.id), input.role, input.disabled, res.locals.actor, input.expected) });
  });
  app.get("/api/admin/audit", allow("audit"), async (_req, res) => res.json({ entries: (await store.snapshot()).audit.slice(-500).reverse() }));
  app.get("/api/admin/outbox", allow("notifications"), async (_req, res) => res.json({ available: mailer.available, messages: (await store.snapshot()).outbox.slice(-200).reverse().map(({ text: _secret, to: _recipient, ...m }) => m) }));
  app.post("/api/admin/outbox/retry", allow("notifications"), async (_req, res) => { const result = await flushOutbox(store, mailer); res.json(result); });
  app.post("/api/admin/outbox/:id/requeue", allow("notifications"), async (req, res) => { await store.transaction((d) => { const m = d.outbox.find((m) => m.id === req.params.id); if (!m || m.status !== "failed" || (m.expiresAt && Date.parse(m.expiresAt) <= Date.now())) throw new StoreError("এই বার্তাটি নতুন করে কিউতে রাখা যাবে না", 409); m.status = mailer.available ? "pending" : "unavailable"; m.attempts = 0; m.nextAttemptAt = new Date().toISOString(); audit(d, res.locals.actor, "mail.requeue", m.id); }); res.json({ ok: true }); });
  app.use("/api", mediaRouter(store, allow("catalog"), options.uploadDir || process.env.UPLOAD_DIR || path.resolve("work/uploads"), allow("inventory")));
  app.use((_req, res) => res.status(404).json({ error: "ঠিকানাটি পাওয়া যায়নি" }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) { res.status(400).json({ error: error.issues[0]?.message || "তথ্য যাচাই করুন" }); return; }
    if (error instanceof StoreError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof multer.MulterError) { res.status(400).json({ error: "ফাইল সর্বোচ্চ ১০ মেগাবাইট হতে পারে; একবারে একটি ফাইল দিন" }); return; }
    if (error?.type === "entity.too.large") { res.status(413).json({ error: "অনুরোধের তথ্য অনুমোদিত আকারের চেয়ে বড়" }); return; }
    if (error instanceof SyntaxError && "body" in error) { res.status(400).json({ error: "অনুরোধের ফরম্যাট সঠিক নয়" }); return; }
    if (error?.code === 11000) { res.status(409).json({ error: "এই পরিচয়, ইমেইল বা slug আগে ব্যবহার করা হয়েছে" }); return; }
    console.error("API error:", error instanceof Error ? error.name : "Unknown error"); res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।" });
  }; app.use(errorHandler); return app;
}
