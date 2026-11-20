import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { seedProducts, deliveryFee } from "../lib/catalog";
import { availableQuantity, isPreorder, salePrice } from "../lib/availability";
import type { Order, OrderInput, OrderStatus, Product } from "../lib/types";
import type { ShopData } from "../lib/commerce-types";
import { migrateState } from "./state";
import { takeStockCost, restoreStockCost } from "../lib/stock-cost";
import { applyCoupon } from "./coupons";

export class StoreError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const id = (prefix: string) => `${prefix}-${randomBytes(12).toString("hex")}`;
export const transitions: Record<OrderStatus, OrderStatus[]> = { pending: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };
export const mixedFulfillmentPolicy = "প্রি-অর্ডারসহ সব বই প্রস্তুত হলে একসঙ্গে একটি পার্সেলে পাঠানো হবে; ডেলিভারি চার্জ একবারই প্রযোজ্য। প্রকাশ ও পাঠানোর তারিখ আনুমানিক।";
export function buildOrder(products: Product[], input: OrderInput, demo: boolean, userId?: string): Order {
  const items = input.items.map((item) => {
    const p = products.find((p) => p.id === item.productId);
    if (!p) throw new StoreError("বইটি পাওয়া যায়নি", 404);
    if (availableQuantity(p) < item.quantity) throw new StoreError(`${p.title}: পর্যাপ্ত স্টক বা প্রি-অর্ডার কোটা নেই`, 409);
    if (isPreorder(p) && !input.acceptPreorderTerms) throw new StoreError("প্রি-অর্ডারের শর্ত ও একসঙ্গে ডেলিভারির নীতি গ্রহণ করুন", 400);
    return { productId: p.id, title: p.title, price: salePrice(p), quantity: item.quantity, preorder: isPreorder(p), ...(isPreorder(p) ? { dispatchDate: p.preorder!.dispatchDate, cancellationTerms: p.preorder!.cancellationTerms } : {}) };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0); const delivery = deliveryFee(input.customer.zone);
  return { id: `NOOR-${randomBytes(8).toString("hex").toUpperCase()}`, customer: input.customer, items, subtotal, delivery, total: subtotal + delivery, status: "pending", paymentMethod: "cod", paymentStatus: "unpaid", demo, createdAt: new Date().toISOString(), userId, preorderStatus: items.some((i) => i.preorder) ? "awaiting-release" : "not-applicable", fulfillmentPolicy: items.some((i) => i.preorder) ? mixedFulfillmentPolicy : "একসঙ্গে ডেলিভারি" };
}
export function reserveOrder(d: ShopData, input: OrderInput, demo: boolean, userId?: string) {
  const order = buildOrder(d.products, input, demo, userId);
  if (input.couponCode) applyCoupon(d, order, input.couponCode);
  for (const item of order.items) {
    const p = d.products.find((p) => p.id === item.productId)!;
    if (item.preorder) p.preorder!.reserved += item.quantity;
    else {
      const before = p.stock;
      item.cost = takeStockCost(p, item.quantity);
      p.stock -= item.quantity;
      d.audit.push({ id: id("audit"), actor: userId || "guest", action: "order.reserved", target: p.id, at: new Date().toISOString(), stockChange: { before, after: p.stock } });
    }
  }
  d.orders.push(order); return order;
}
export function changeOrderStatus(d: ShopData, orderId: string, status: OrderStatus, actor = "system") {
  const o = d.orders.find((o) => o.id === orderId);
  if (!o) throw new StoreError("অর্ডার পাওয়া যায়নি", 404);
  if (!transitions[o.status].includes(status)) throw new StoreError("এই স্ট্যাটাস পরিবর্তন গ্রহণযোগ্য নয়", 409);
  if (status === "shipped" && o.preorderStatus === "awaiting-release") throw new StoreError("প্রি-অর্ডার প্রস্তুত হিসেবে চিহ্নিত করুন", 409);
  if (status === "cancelled") {
    if (d.payments.some((p) => p.orderId === o.id)) throw new StoreError("মূল্য গ্রহণ করা অর্ডারের জন্য রিটার্ন ও রিফান্ডের প্রক্রিয়া ব্যবহার করুন", 409);
    for (const i of o.items) {
      const p = d.products.find((p) => p.id === i.productId);
      if (p) {
        if (i.preorder && p.preorder) p.preorder.reserved = Math.max(0, p.preorder.reserved - i.quantity);
        else {
          const before = p.stock;
          if (i.cost) restoreStockCost(p, i.quantity - i.cost.unknownQuantity, i.cost.knownMinor);
          p.stock += i.quantity;
          d.audit.push({ id: id("audit"), actor, action: "order.restocked", target: p.id, at: new Date().toISOString(), stockChange: { before, after: p.stock } });
        }
      }
    }
  }
  if (status === "delivered" && o.preorderStatus === "ready") o.preorderStatus = "fulfilled";
  if (status === "delivered") o.deliveredAt = new Date().toISOString();
  o.status = status; return o;
}
export interface Store {
  demo: boolean;
  snapshot(): Promise<ShopData>;
  transaction<T>(callback: (data: ShopData) => T | Promise<T>): Promise<T>;
  products(): Promise<Product[]>; saveProduct(product: Product): Promise<Product>;
  placeOrder(input: OrderInput, userId?: string): Promise<Order>; orders(): Promise<Order[]>;
  findOrder(id: string, phone: string): Promise<Order | null>; updateStatus(id: string, status: OrderStatus): Promise<Order>;
}
abstract class BaseStore implements Store {
  abstract demo: boolean;
  abstract snapshot(): Promise<ShopData>;
  abstract transaction<T>(callback: (data: ShopData) => T | Promise<T>): Promise<T>;
  async products() { return (await this.snapshot()).products; }
  async orders() { return (await this.snapshot()).orders.slice(-200).reverse(); }
  async findOrder(orderId: string, phone: string) { return (await this.snapshot()).orders.find((o) => o.id === orderId && o.customer.phone === phone) || null; }
  saveProduct(p: Product) { return this.transaction((d) => {
    if (d.products.some((r) => r.slug === p.slug && r.id !== p.id)) throw new StoreError("এই slug আগে ব্যবহার করা হয়েছে", 409);
    const i = d.products.findIndex((r) => r.id === p.id); if (i < 0) d.products.push(p); else d.products[i] = p; return p;
  }); }
  placeOrder(input: OrderInput, userId?: string) { return this.transaction((d) => reserveOrder(d, input, this.demo, userId)); }
  updateStatus(orderId: string, status: OrderStatus) { return this.transaction((d) => changeOrderStatus(d, orderId, status)); }
}
export class FileStore extends BaseStore {
  demo = true; private queue: Promise<unknown> = Promise.resolve();
  constructor(private filename: string) { super(); }
  private async read(): Promise<ShopData> {
    try { return migrateState(JSON.parse(await readFile(this.filename, "utf8"))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; return migrateState(); }
  }
  async snapshot() { await this.queue; return this.read(); }
  transaction<T>(callback: (data: ShopData) => T | Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const d = await this.read(); const result = await callback(d);
      await mkdir(path.dirname(this.filename), { recursive: true });
      await writeFile(`${this.filename}.tmp`, JSON.stringify(d, null, 2), { mode: 0o600 });
      await rename(`${this.filename}.tmp`, this.filename); return result;
    }); this.queue = task.catch(() => {}); return task;
  }
}
type RecordDoc = { id: string; [key: string]: unknown };
type StateKey = keyof ShopData;
const names: Record<StateKey, string> = { products: "Book", orders: "Order", users: "CustomerAccount", sessions: "CustomerSession", tokens: "IdentityToken", staffInvitations: "StaffInvitation", suppliers: "BookSupplier", purchases: "BookPurchase", supplierPayments: "SupplierPayment", reviews: "BookReview", collections: "EditorialCollection", assets: "MediaAsset", subscriptions: "StockSubscription", notifications: "CustomerNotification", outbox: "MailOutbox", returns: "BookReturn", payments: "OrderPayment", refunds: "OrderRefund", audit: "ShopAudit", coupons: "ShopCoupon", expenses: "ShopExpense", imports: "CatalogImport" };
const models = Object.fromEntries(Object.entries(names).map(([key, name]) => {
  const schema = new mongoose.Schema({ id: { type: String, required: true, unique: true } }, { versionKey: false, strict: false });
  if (key === "users") schema.index({ email: 1 }, { unique: true });
  if (key === "staffInvitations") schema.index({ email: 1 }, { unique: true });
  if (key === "products" || key === "collections") schema.index({ slug: 1 }, { unique: true });
  if (key === "reviews" || key === "subscriptions") schema.index({ userId: 1, productId: 1 }, { unique: true });
  return [key, (mongoose.models[name] || mongoose.model<RecordDoc>(name, schema)) as mongoose.Model<RecordDoc>];
})) as Record<StateKey, mongoose.Model<RecordDoc>>;
const Revision = mongoose.models.ShopRevision || mongoose.model("ShopRevision", new mongoose.Schema({ id: { type: String, unique: true }, revision: Number }));
const clean = <T>(v: unknown): T => JSON.parse(JSON.stringify(v, (key, value) => key === "_id" || key === "__v" ? undefined : value));
export class MongoStore extends BaseStore {
  constructor(public demo: boolean) { super(); }
  private async load(session?: mongoose.ClientSession): Promise<ShopData> {
    const result = {} as Record<StateKey, unknown>;
    for (const key of Object.keys(models) as StateKey[]) { const query = models[key].find(); if (session) query.session(session); result[key] = clean(await query.lean()); }
    return migrateState(result as Partial<ShopData>);
  }
  snapshot() { return this.load(); }
  async transaction<T>(callback: (data: ShopData) => T | Promise<T>): Promise<T> {
    const session = await mongoose.startSession(); let result: T;
    try {
      await session.withTransaction(async () => {
        await Revision.updateOne({ id: "commerce" }, { $inc: { revision: 1 } }, { session });
        const before = await this.load(session); const after = structuredClone(before); result = await callback(after);
        for (const key of Object.keys(models) as StateKey[]) {
          const old = new Map(before[key].map((r) => [r.id, JSON.stringify(r)])); const current = after[key] as { id: string }[];
          const operations: mongoose.AnyBulkWriteOperation<RecordDoc>[] = [];
          for (const record of current) if (old.get(record.id) !== JSON.stringify(record)) operations.push({ replaceOne: { filter: { id: record.id }, replacement: clean<RecordDoc>(record), upsert: true } });
          const ids = new Set(current.map((r) => r.id));
          for (const record of before[key]) if (!ids.has(record.id)) operations.push({ deleteOne: { filter: { id: record.id } } });
          if (operations.length) await models[key].bulkWrite(operations, { session });
        }
      }); return result!;
    } finally { await session.endSession(); }
  }
}
export async function connectStore(uri?: string, demo = true, production = process.env.NODE_ENV === "production"): Promise<Store> {
  if (uri) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    await Promise.all([...Object.values(models).map((m) => m.init()), Revision.init()]);
    await Revision.updateOne({ id: "commerce" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    const store = new MongoStore(demo); await store.transaction((d) => { if (!d.collections.length) d.collections = migrateState().collections; }); return store;
  }
  if (!demo || production) throw new Error("MongoDB is required for production. Configure MONGODB_URI; local demo storage is development-only.");
  return new FileStore(path.resolve("work/data/store.json"));
}
export async function seedMongo() { for (const p of seedProducts) await models.products.updateOne({ id: p.id }, { $setOnInsert: { ...p, sample: true } }, { upsert: true }); }
