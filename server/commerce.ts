import { randomBytes } from "node:crypto";
import type { AccountData, Collection, Dashboard, PublicUser, Refund, Role, ShopData, User } from "../lib/commerce-types";
import type { OrderStatus, Product } from "../lib/types";
import { isPreorder } from "../lib/availability";
import { changeOrderStatus, id, StoreError, type Store } from "./store";
import { hashPassword, publicUser, tokenHash } from "./auth";
import type { Mailer } from "./mail";

const now = () => new Date().toISOString();
export function audit(d: ShopData, actor: string, action: string, target: string) { d.audit.push({ id: id("audit"), actor, action, target, at: now() }); }
export function findUser(d: ShopData, userId: string) { const u = d.users.find((u) => u.id === userId && !u.disabled); if (!u) throw new StoreError("অ্যাকাউন্ট পাওয়া যায়নি", 401); return u; }
export function ownOrder(d: ShopData, orderId: string, userId: string) { const o = d.orders.find((o) => o.id === orderId && o.userId === userId); if (!o) throw new StoreError("অর্ডার পাওয়া যায়নি", 404); return o; }
export class CommerceService {
  constructor(public store: Store, private mailer: Mailer, private appUrl: string) {}
  private notify(d: ShopData, userId: string, message: string, href: string, type: "restock" | "preorder") {
    const u = d.users.find((u) => u.id === userId && !u.disabled); if (!u) return;
    d.notifications.push({ id: id("notice"), userId, message, href, read: false, createdAt: now() });
    if (u.emailVerified) d.outbox.push({ id: id("mail"), userId, to: u.email, subject: "নূর বুকশপ — আপনার বইয়ের খবর", text: `${message}\n${this.appUrl}${href}`, type, status: this.mailer.available ? "pending" : "unavailable", attempts: 0, nextAttemptAt: now(), createdAt: now() });
  }
  restock(d: ShopData, p: Product, previousStock: number) {
    if (previousStock > 0 || p.stock <= 0 || isPreorder(p)) return;
    p.restockVersion = (p.restockVersion || 0) + 1;
    for (const s of d.subscriptions) if (s.productId === p.id && s.active && s.lastVersion < p.restockVersion) {
      this.notify(d, s.userId, `“${p.title}” আবার স্টকে এসেছে।`, `/books/${p.slug}`, "restock"); s.lastVersion = p.restockVersion;
    }
  }
  async catalog() {
    const d = await this.store.snapshot();
    return d.products.map((p) => {
      const approved = d.reviews.filter((r) => r.productId === p.id && r.status === "approved");
      const { previewPermissionNote: _privateNote, ...safe } = p;
      return { ...safe, previewAssetIds: p.previewPermission ? p.previewAssetIds : [], rating: { count: approved.length, average: approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0 } };
    });
  }
  saveProduct(p: Product, actor: string) { return this.store.transaction((d) => {
    const old = d.products.find((r) => r.id === p.id);
    if (d.products.some((r) => r.slug === p.slug && r.id !== p.id)) throw new StoreError("এই slug আগে ব্যবহার করা হয়েছে", 409);
    const assets = (assetId: string, kinds: string[]) => { const a = d.assets.find((a) => a.id === assetId); if (!a || !kinds.includes(a.kind) || (a.productId && a.productId !== p.id)) throw new StoreError("বইয়ের আপলোড করা ফাইলটি পাওয়া যায়নি বা অনুমতি নেই"); return a; };
    if (p.coverAssetId) assets(p.coverAssetId, ["cover"]);
    for (const assetId of p.galleryAssetIds || []) assets(assetId, ["gallery", "cover"]);
    const previews = (p.previewAssetIds || []).map((a) => assets(a, ["preview"]));
    if (new Set(p.previewAssetIds || []).size !== previews.length) throw new StoreError("একই প্রিভিউ পৃষ্ঠা দুবার রাখা যাবে না");
    if (previews.some((a) => a.mime === "application/pdf") && previews.length > 1) throw new StoreError("একটি PDF অথবা ছবির পৃষ্ঠাগুলো বেছে নিন");
    if (previews.reduce((n, a) => n + a.pages, 0) >= p.pages && previews.length) throw new StoreError("নমুনা পৃষ্ঠার সংখ্যা সম্পূর্ণ বইয়ের চেয়ে কম হতে হবে");
    if (previews.length && p.previewPermission && (p.previewPermissionNote || "").trim().length < 5) throw new StoreError("প্রিভিউ প্রকাশের অনুমতির বিবরণ লিখুন");
    p.restockVersion = old?.restockVersion || 0;
    if (old?.preorder?.reserved && !p.preorder) throw new StoreError("বিদ্যমান প্রি-অর্ডারের হিসাব রাখা প্রয়োজন");
    if (p.preorder) {
      p.preorder.reserved = old?.preorder?.reserved || 0;
      if (p.preorder.limit < p.preorder.reserved) throw new StoreError("প্রি-অর্ডারের সীমা ইতিমধ্যে সংরক্ষিত কপির চেয়ে কম হতে পারে না", 409);
      if (p.preorder.price > p.originalPrice) throw new StoreError("প্রি-অর্ডারের দাম মূল দামের চেয়ে বেশি হতে পারে না");
    }
    if (old) d.products[d.products.indexOf(old)] = p; else d.products.push(p);
    this.restock(d, p, old?.stock || 0);
    if (old?.preorder?.dispatchDate && p.preorder?.dispatchDate !== old.preorder.dispatchDate) {
      for (const o of d.orders) if (!["cancelled", "delivered"].includes(o.status) && o.items.some((i) => i.productId === p.id && i.preorder)) {
        for (const i of o.items) if (i.productId === p.id && i.preorder) i.dispatchDate = p.preorder?.dispatchDate;
        if (o.userId) this.notify(d, o.userId, `“${p.title}” বইয়ের সম্ভাব্য পাঠানোর সময় পরিবর্তিত হয়েছে। অর্ডারের তথ্য দেখুন।`, "/account", "preorder");
      }
    }
    audit(d, actor, old ? "product.update" : "product.create", p.id); return p;
  }); }
  async account(userId: string): Promise<AccountData> { const d = await this.store.snapshot(); const returns = d.returns.filter((r) => r.userId === userId).reverse(); return { user: publicUser(findUser(d, userId)), orders: d.orders.filter((o) => o.userId === userId).reverse(), notifications: d.notifications.filter((n) => n.userId === userId).reverse(), subscriptions: d.subscriptions.filter((s) => s.userId === userId), returns, reviews: d.reviews.filter((r) => r.userId === userId), refunds: d.refunds.filter((r) => returns.some((v) => v.id === r.returnId)).map(({ id, returnId, amount, status, completedAt }) => ({ id, returnId, amount, status, completedAt })) }; }
  identityEmail(userId: string, purpose: "reset" | "verify") { return this.store.transaction((d) => {
    const u = findUser(d, userId); if (!this.mailer.available) return { deliveryAvailable: false, queued: false };
    const token = randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + (purpose === "reset" ? 30 : 1440) * 60000).toISOString();
    d.tokens = d.tokens.filter((t) => !(t.userId === userId && t.purpose === purpose));
    for (const m of d.outbox) if (m.userId === userId && m.type === purpose && m.status !== "sent") { m.status = "failed"; m.text = "Replaced identity link"; }
    d.tokens.push({ id: tokenHash(token), userId, purpose, expiresAt });
    d.outbox.push({ id: id("mail"), userId, to: u.email, subject: purpose === "reset" ? "নূর বুকশপ — পাসওয়ার্ড পুনরুদ্ধার" : "নূর বুকশপ — ইমেইল যাচাই", text: `${this.appUrl}/account/${purpose}?token=${token}\nএই লিংক শুধু আপনার জন্য।`, type: purpose, status: "pending", attempts: 0, nextAttemptAt: now(), createdAt: now(), expiresAt });
    return { deliveryAvailable: true, queued: true };
  }); }
  subscribe(userId: string, productId: string, active: boolean) { return this.store.transaction((d) => {
    findUser(d, userId); const p = d.products.find((p) => p.id === productId); if (!p) throw new StoreError("বইটি পাওয়া যায়নি", 404);
    if (active && (p.stock > 0 || isPreorder(p))) throw new StoreError("এই বইটি এখন কেনা বা প্রি-অর্ডার করা যায়", 409);
    const s = d.subscriptions.find((s) => s.userId === userId && s.productId === productId);
    if (s) { s.active = active; s.lastVersion = p.restockVersion || 0; return s; }
    const created = { id: id("subscription"), userId, productId, active, lastVersion: p.restockVersion || 0 }; d.subscriptions.push(created); return created;
  }); }
  async reviews(productId: string, userId?: string) {
    const d = await this.store.snapshot(); const reviews = d.reviews.filter((r) => r.productId === productId && r.status === "approved");
    return { reviews: reviews.map(({ userId: _owner, moderationNote: _note, ...r }) => r), ownReview: userId ? d.reviews.find((r) => r.userId === userId && r.productId === productId) || null : null, eligible: !!userId && d.orders.some((o) => o.userId === userId && !o.demo && o.status === "delivered" && o.items.some((i) => i.productId === productId)) };
  }
  review(userId: string, productId: string, input: { rating: number; text: string }) { return this.store.transaction((d) => {
    const u = findUser(d, userId);
    if (!d.orders.some((o) => o.userId === userId && !o.demo && o.status === "delivered" && o.items.some((i) => i.productId === productId))) throw new StoreError("রিভিউ দিতে এই অ্যাকাউন্টের বাস্তব ও ডেলিভারি সম্পন্ন অর্ডার প্রয়োজন", 403);
    const current = d.reviews.find((r) => r.userId === userId && r.productId === productId);
    if (current && Date.now() - Date.parse(current.updatedAt) < 60000) throw new StoreError("রিভিউ পরিবর্তনের আগে এক মিনিট অপেক্ষা করুন", 429);
    if (current) { Object.assign(current, input, { displayName: u.name, status: "pending", updatedAt: now(), moderationNote: "" }); return current; }
    const review = { id: id("review"), productId, userId, displayName: u.name, ...input, status: "pending" as const, verified: true, createdAt: now(), updatedAt: now() }; d.reviews.push(review); return review;
  }); }
  moderate(reviewId: string, status: "approved" | "rejected" | "hidden", note: string, actor: string) { return this.store.transaction((d) => {
    const r = d.reviews.find((r) => r.id === reviewId); if (!r) throw new StoreError("রিভিউ পাওয়া যায়নি", 404);
    r.status = status; r.moderationNote = note; audit(d, actor, `review.${status}`, reviewId); return r;
  }); }
  saveCollection(c: Collection, actor: string) { return this.store.transaction((d) => {
    if (d.collections.some((r) => r.slug === c.slug && r.id !== c.id)) throw new StoreError("এই সংগ্রহের slug আগে ব্যবহার হয়েছে", 409);
    if (c.productIds.some((bookId) => !d.products.some((p) => p.id === bookId))) throw new StoreError("সংগ্রহের একটি বই পাওয়া যায়নি");
    if (c.imageAssetId && !d.assets.some((a) => a.id === c.imageAssetId && a.kind === "collection")) throw new StoreError("সংগ্রহের ছবি পাওয়া যায়নি");
    const i = d.collections.findIndex((r) => r.id === c.id); if (i < 0) d.collections.push(c); else d.collections[i] = c;
    audit(d, actor, "collection.save", c.id); return c;
  }); }
  orderStatus(orderId: string, status: OrderStatus, actor: string) { return this.store.transaction((d) => {
    const before = new Map(d.products.map((p) => [p.id, p.stock])); const o = changeOrderStatus(d, orderId, status);
    for (const p of d.products) this.restock(d, p, before.get(p.id) || 0);
    audit(d, actor, `order.${status}`, orderId); return o;
  }); }
  readyPreorder(orderId: string, actor: string) { return this.store.transaction((d) => {
    const o = d.orders.find((o) => o.id === orderId); if (!o) throw new StoreError("অর্ডার পাওয়া যায়নি", 404);
    if (o.preorderStatus !== "awaiting-release" || !["pending", "confirmed"].includes(o.status)) throw new StoreError("এই অর্ডারের প্রি-অর্ডার অবস্থা পরিবর্তন করা যাবে না", 409);
    o.preorderStatus = "ready"; if (o.userId) this.notify(d, o.userId, "আপনার প্রি-অর্ডারের সব বই প্রস্তুত হয়েছে।", "/account", "preorder");
    audit(d, actor, "preorder.ready", o.id); return o;
  }); }
  requestReturn(userId: string, input: { orderId: string; reason: string; items: { productId: string; quantity: number }[] }) { return this.store.transaction((d) => {
    const o = ownOrder(d, input.orderId, userId); if (o.status !== "delivered") throw new StoreError("ডেলিভারি সম্পন্ন অর্ডারের জন্য রিটার্ন অনুরোধ করা যায়", 409);
    for (const i of input.items) {
      const bought = o.items.find((x) => x.productId === i.productId)?.quantity || 0;
      const reserved = d.returns.filter((r) => r.orderId === o.id && !["rejected", "withdrawn"].includes(r.status)).flatMap((r) => r.items).filter((x) => x.productId === i.productId).reduce((s, x) => s + x.quantity, 0);
      if (i.quantity > bought - reserved) throw new StoreError("কেনা বা অবশিষ্ট ফেরতযোগ্য পরিমাণের চেয়ে বেশি বই দেওয়া হয়েছে", 409);
    }
    const r = { id: id("return"), ...input, userId, status: "requested" as const, restocked: false, note: "", createdAt: now() }; d.returns.push(r); return r;
  }); }
  returnStatus(returnId: string, status: "approved" | "rejected" | "received", restock: boolean, note: string, actor: string) { return this.store.transaction((d) => {
    const r = d.returns.find((r) => r.id === returnId); if (!r) throw new StoreError("রিটার্ন পাওয়া যায়নি", 404);
    if (!((r.status === "requested" && ["approved", "rejected"].includes(status)) || (r.status === "approved" && status === "received"))) throw new StoreError("রিটার্নের এই পরিবর্তন গ্রহণযোগ্য নয়", 409);
    if (status === "received" && restock && !r.restocked) { for (const i of r.items) { const p = d.products.find((p) => p.id === i.productId); if (p) { const old = p.stock; p.stock += i.quantity; this.restock(d, p, old); } } r.restocked = true; }
    r.status = status; r.note = note; audit(d, actor, `return.${status}`, r.id); return r;
  }); }
  recordPayment(orderId: string, amount: number, reference: string, method: "cod" | "bank", actor: string) { return this.store.transaction((d) => {
    const o = d.orders.find((o) => o.id === orderId); if (!o) throw new StoreError("অর্ডার পাওয়া যায়নি", 404);
    if (o.demo || o.status === "cancelled") throw new StoreError("ডেমো বা বাতিল অর্ডারে বাস্তব পেমেন্ট রেকর্ড করা যাবে না", 409);
    const paid = d.payments.filter((p) => p.orderId === o.id).reduce((n, p) => n + p.amount, 0);
    if (amount > o.total - paid || d.payments.some((p) => p.reference === reference)) throw new StoreError("পরিমাণ বকেয়ার চেয়ে বেশি বা রেফারেন্সটি ব্যবহৃত হয়েছে", 409);
    const p = { id: id("payment"), orderId, amount, reference, method, recordedBy: actor, createdAt: now() }; d.payments.push(p); o.paymentStatus = paid + amount === o.total ? "paid" : "partial";
    audit(d, actor, "payment.manual-record", p.id); return p;
  }); }
  createRefund(returnId: string, amount: number, method: "cash" | "bank", actor: string) { return this.store.transaction((d) => {
    const r = d.returns.find((r) => r.id === returnId); if (!r || r.status !== "received") throw new StoreError("প্রাপ্ত রিটার্ন বেছে নিন", 409);
    const o = d.orders.find((o) => o.id === r.orderId)!; if (o.demo) throw new StoreError("ডেমো অর্ডারে বাস্তব রিফান্ড নয়", 409);
    const paid = d.payments.filter((p) => p.orderId === o.id).reduce((n, p) => n + p.amount, 0);
    const reserved = d.refunds.filter((f) => f.orderId === o.id && f.status !== "cancelled").reduce((n, f) => n + f.amount, 0);
    const returnValue = r.items.reduce((n, i) => n + i.quantity * (o.items.find((x) => x.productId === i.productId)?.price || 0), 0);
    const returnReserved = d.refunds.filter((f) => f.returnId === r.id && f.status !== "cancelled").reduce((n, f) => n + f.amount, 0);
    if (amount > Math.min(paid - reserved, returnValue - returnReserved)) throw new StoreError("পরিমাণ ফেরতযোগ্য অর্থের চেয়ে বেশি", 409);
    const refund: Refund = { id: id("refund"), returnId, orderId: o.id, amount, method, reference: "", status: "pending", recordedBy: actor, createdAt: now() }; d.refunds.push(refund); audit(d, actor, "refund.request", refund.id); return refund;
  }); }
  finishRefund(refundId: string, status: "completed" | "cancelled", reference: string, confirmedManual: boolean, actor: string) { return this.store.transaction((d) => {
    const f = d.refunds.find((f) => f.id === refundId); if (!f) throw new StoreError("রিফান্ড পাওয়া যায়নি", 404);
    if (f.status !== "pending") throw new StoreError("এই রিফান্ড আগেই নিষ্পত্তি হয়েছে", 409);
    if (status === "completed" && (!confirmedManual || reference.trim().length < 3 || d.refunds.some((r) => r.reference === reference && r.id !== f.id))) throw new StoreError("বাস্তবে টাকা ফেরত দেওয়ার নিশ্চয়তা ও অনন্য রেফারেন্স দিন");
    f.status = status; f.reference = status === "completed" ? reference : "";
    if (status === "completed") { f.completedAt = now(); const o = d.orders.find((o) => o.id === f.orderId)!; const paid = d.payments.filter((p) => p.orderId === o.id).reduce((n, p) => n + p.amount, 0); const refunded = d.refunds.filter((r) => r.orderId === o.id && r.status === "completed").reduce((n, r) => n + r.amount, 0); if (paid === refunded) o.paymentStatus = "refunded"; }
    audit(d, actor, `refund.manual-${status}`, f.id); return f;
  }); }
  async staff(input: { name: string; email: string; password: string; role: Role }, actor: string): Promise<PublicUser> {
    const passwordHash = await hashPassword(input.password);
    return this.store.transaction((d) => { if (d.users.some((u) => u.email === input.email)) throw new StoreError("এই ইমেইলে অ্যাকাউন্ট আছে; বিদ্যমান অ্যাকাউন্টের ভূমিকা সম্পাদনা করুন", 409); const u: User = { id: id("user"), name: input.name, email: input.email, passwordHash, role: input.role, emailVerified: false, disabled: false, addresses: [], createdAt: now() }; d.users.push(u); audit(d, actor, "staff.create", u.id); return publicUser(u); });
  }
  updateStaff(userId: string, role: Role, disabled: boolean, actor: string) { return this.store.transaction((d) => {
    const u = d.users.find((u) => u.id === userId); if (!u) throw new StoreError("অ্যাকাউন্ট পাওয়া যায়নি", 404);
    if (u.role === "owner" && (disabled || role !== "owner") && !d.users.some((x) => x.id !== u.id && x.role === "owner" && !x.disabled)) throw new StoreError("সর্বশেষ সক্রিয় মালিককে নিষ্ক্রিয় বা সরানো যাবে না", 409);
    u.role = role; u.disabled = disabled; d.sessions = d.sessions.filter((s) => s.userId !== u.id); audit(d, actor, "staff.permissions", userId); return publicUser(u);
  }); }
  async dashboard(from?: string, to?: string): Promise<Dashboard> {
    const d = await this.store.snapshot(); const within = (date: string) => (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);
    const all = d.orders.filter((o) => within(o.createdAt)); const real = all.filter((o) => !o.demo); const valid = real.filter((o) => o.status !== "cancelled"); const realIds = new Set(d.orders.filter((o) => !o.demo).map((o) => o.id));
    const collected = d.payments.filter((p) => realIds.has(p.orderId) && within(p.createdAt)).reduce((n, p) => n + p.amount, 0);
    const refunded = d.refunds.filter((r) => r.status === "completed" && realIds.has(r.orderId) && within(r.completedAt || r.createdAt)).reduce((n, r) => n + r.amount, 0);
    return { orderCount: real.length, demoCount: all.length - real.length, cancelledCount: real.filter((o) => o.status === "cancelled").length, orderedTotal: valid.reduce((n, o) => n + o.total, 0), deliveredSales: valid.filter((o) => o.status === "delivered").reduce((n, o) => n + o.total, 0), collected, refunded, netCollected: collected - refunded, outstanding: valid.reduce((n, o) => n + Math.max(0, o.total - d.payments.filter((p) => p.orderId === o.id).reduce((s, p) => s + p.amount, 0)), 0), lowStock: d.products.filter((p) => !isPreorder(p) && p.stock <= (p.lowStockThreshold ?? 5)) };
  }
}
