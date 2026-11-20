import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../server/app";
import { FileStore, reserveOrder } from "../server/store";
import { flushOutbox, type Mailer } from "../server/mail";
import { tokenHash } from "../server/auth";
import type { OutboxMessage, PublicUser } from "../lib/commerce-types";
import type { OrderInput } from "../lib/types";

const key = "isolated-test-owner-key-over-24-characters";
const password = "Example-Password-123456";
const customer = { name: "নমুনা পাঠক", phone: "01700000000", address: "পরীক্ষার ঠিকানা, বাড়ি ১০, রোড ৫", city: "ঢাকা", zone: "dhaka" as const };
const orderInput: OrderInput = { customer, items: [{ productId: "b001", quantity: 1 }], paymentMethod: "cod" };
const noMail: Mailer = { available: false, async send() { throw new Error("Not configured"); } };
async function setup(t: { after: (fn: () => Promise<void>) => void }, mailer = noMail) {
  const base = path.resolve("work"); await mkdir(base, { recursive: true }); const dir = await mkdtemp(path.join(base, "commerce-tests-"));
  assert.ok(dir.startsWith(base + path.sep)); t.after(async () => { assert.ok(path.resolve(dir).startsWith(base + path.sep)); await rm(dir, { recursive: true, force: true }); });
  const filename = path.join(dir, "store.json"); const store = new FileStore(filename); const app = createApp(store, key, { uploadDir: path.join(dir, "uploads"), mailer });
  const owner = (method: "get" | "post" | "put" | "patch" | "delete", url: string) => request(app)[method](`/api/admin${url}`).set("Authorization", `Bearer ${key}`);
  const register = async (email = "reader@example.test") => { const agent = request.agent(app); const { body } = await agent.post("/api/auth/register").send({ name: "নমুনা পাঠক", email, password, role: "owner" }).expect(201); return { agent, user: body.user as PublicUser }; };
  return { store, app, owner, register, filename };
}
test("accounts use HttpOnly hashed sessions, ignore role escalation, and enforce ownership", async (t) => {
  const { app, store, register } = await setup(t); const { agent, user } = await register();
  assert.equal(user.role, "customer"); assert.ok(!("passwordHash" in user));
  const d = await store.snapshot(); assert.notEqual(d.users[0].passwordHash, password); assert.ok(d.users[0].passwordHash.startsWith("scrypt:"));
  const login = await agent.post("/api/auth/login").send({ email: user.email, password }).expect(200); assert.match(String(login.headers["set-cookie"]), /HttpOnly/); assert.match(String(login.headers["set-cookie"]), /SameSite=Lax/);
  await request(app).get("/api/account").expect(401);
  const guest = await request(app).post("/api/orders").send(orderInput).expect(201);
  const own = await agent.post("/api/orders").send(orderInput).expect(201);
  const account = await agent.get("/api/account").expect(200); assert.deepEqual(account.body.orders.map((o: { id: string }) => o.id), [own.body.order.id]); assert.notEqual(account.body.orders[0].id, guest.body.order.id);
  const other = await register("other@example.test"); await other.agent.post(`/api/account/orders/${own.body.order.id}/reorder`).send({}).expect(404);
  await agent.post("/api/auth/logout").send({}).expect(200); await agent.get("/api/account").expect(401);
  await other.agent.post("/api/auth/login").set("Origin", "https://untrusted.example").send({ email: other.user.email, password }).expect(403);
});
test("saved addresses are owned, validated and reusable; expired sessions cannot access them", async (t) => {
  const { register, store } = await setup(t); const a = await register(); const b = await register("second@example.test");
  const saved = await a.agent.put("/api/account/addresses").send({ ...customer, label: "বাসা" }).expect(200);
  await b.agent.put("/api/account/addresses").send({ ...customer, id: saved.body.address.id, label: "অন্যের ঠিকানা" }).expect(404);
  await a.agent.put("/api/account/addresses").send({ ...customer, id: saved.body.address.id, label: "অফিস" }).expect(200);
  assert.equal((await a.agent.get("/api/account")).body.user.addresses[0].label, "অফিস");
  await store.transaction((d) => { for (const s of d.sessions) if (s.userId === a.user.id) s.expiresAt = "2000-01-01T00:00:00Z"; });
  await a.agent.get("/api/account").expect(401);
});
test("reordering fetches the current catalog rather than reusing historical prices or stock", async (t) => {
  const { register, store, owner } = await setup(t); const a = await register();
  const created = await a.agent.post("/api/orders").send(orderInput).expect(201);
  const p = (await store.products())[0]; await owner("put", "/products/b001").send({ ...p, price: 410, stock: 0 }).expect(200);
  const r = await a.agent.post(`/api/account/orders/${created.body.order.id}/reorder`).send({}).expect(200);
  const current = r.body.products.find((p: { id: string }) => p.id === "b001"); assert.equal(current.price, 410); assert.equal(current.stock, 0);
  assert.equal((await store.orders())[0].items[0].price, 450);
});
test("staff permissions are enforced by API and permission changes revoke sessions", async (t) => {
  const { app, owner } = await setup(t);
  const created = await owner("post", "/staff").send({ name: "সম্পাদক", email: "editor@example.test", password, role: "catalog" }).expect(201);
  const editor = request.agent(app); await editor.post("/api/auth/login").send({ email: "editor@example.test", password }).expect(200);
  await editor.get("/api/admin/catalog").expect(200); await editor.get("/api/admin/collections").expect(200);
  await editor.get("/api/admin/products/b001").expect(200);
  for (const endpoint of ["/orders", "/finance", "/staff", "/dashboard"]) await editor.get(`/api/admin${endpoint}`).expect(403);
  await owner("patch", `/staff/${created.body.user.id}`).send({ role: "orders", disabled: false }).expect(200);
  await editor.get("/api/admin/access").expect(401);
  await editor.post("/api/auth/login").send({ email: "editor@example.test", password }).expect(200);
  await editor.get("/api/admin/orders").expect(200); await editor.get("/api/admin/catalog").expect(403);
  await editor.get("/api/admin/products/b001").expect(403);
  await editor.post("/api/admin/products").send({}).expect(403);
});

test("staff invitations are private, replaceable, expiring and accepted only once", async (t) => {
  const unavailable = await setup(t);
  const input = { name: "Invited Editor", email: "invited@example.test", role: "catalog" };
  await unavailable.owner("post", "/staff/invitations").send(input).expect(503);
  assert.equal((await unavailable.store.snapshot()).staffInvitations.length, 0);

  const delivered: OutboxMessage[] = [];
  const mailer: Mailer = { available: true, async send(message) { delivered.push(structuredClone(message)); } };
  const { app, owner, store, register } = await setup(t, mailer);
  const reader = await register();
  await reader.agent.post("/api/admin/staff/invitations").send(input).expect(401);
  const created = await owner("post", "/staff/invitations").send(input).expect(201);
  assert.equal(created.body.invitation.status, "pending");
  assert.equal(created.body.invitation.tokenHash, undefined);
  assert.equal((await store.snapshot()).users.some((user) => user.email === input.email), false);
  await owner("post", "/staff/invitations").send(input).expect(409);
  const firstToken = (await store.snapshot()).outbox.find((mail) => mail.type === "invite")!.text.match(/token=([a-f0-9]{64})/)![1];
  await owner("post", `/staff/invitations/${created.body.invitation.id}/resend`).send({}).expect(200);
  const stored = await store.snapshot();
  const replacement = stored.outbox.findLast((mail) => mail.type === "invite")!;
  const token = replacement.text.match(/token=([a-f0-9]{64})/)![1];
  assert.notEqual(token, firstToken);
  assert.equal(stored.staffInvitations[0].tokenHash, tokenHash(token));
  await request(app).post("/api/auth/accept-invite").send({ token: firstToken, password }).expect(400);
  const privateList = await owner("get", "/staff").expect("Cache-Control", "private, no-store").expect(200);
  assert.equal(JSON.stringify(privateList.body).includes(tokenHash(token)), false);
  await flushOutbox(store, mailer);
  assert.equal(delivered.filter((mail) => mail.type === "invite").length, 1);
  assert.ok(!(await store.snapshot()).outbox.some((mail) => mail.type === "invite" && mail.text.includes("token=")));
  const acceptance = await Promise.all([
    request(app).post("/api/auth/accept-invite").send({ token, password }),
    request(app).post("/api/auth/accept-invite").send({ token, password }),
  ]);
  assert.deepEqual(acceptance.map((response) => response.status).sort(), [200, 400]);
  const member = (await store.snapshot()).users.find((user) => user.email === input.email)!;
  assert.equal(member.role, "catalog");
  assert.equal(member.emailVerified, true);
  assert.notEqual(member.passwordHash, password);
  await owner("post", `/staff/invitations/${created.body.invitation.id}/resend`).send({}).expect(409);
  const acceptedList = await owner("get", "/staff").expect(200);
  assert.equal(acceptedList.body.invitations[0].status, "accepted");
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: input.email, password }).expect(200);
  await agent.get("/api/admin/catalog").expect(200);
  await agent.get("/api/admin/staff").expect(403);
  const expired = await owner("post", "/staff/invitations").send({ ...input, email: "expired@example.test" }).expect(201);
  const expiredToken = (await store.snapshot()).outbox.findLast((mail) => mail.type === "invite")!.text.match(/token=([a-f0-9]{64})/)![1];
  await store.transaction((data) => { data.staffInvitations.find((invite) => invite.id === expired.body.invitation.id)!.expiresAt = "2000-01-01T00:00:00Z"; });
  await request(app).post("/api/auth/accept-invite").send({ token: expiredToken, password }).expect(400);
  assert.equal((await owner("get", "/staff")).body.invitations.find((invite: { id: string }) => invite.id === expired.body.invitation.id).status, "expired");
});

test("staff sessions, customer promotion, activity and stale permission edits preserve owner access", async (t) => {
  const { owner, app, store, register } = await setup(t);
  const customer = await register();
  assert.equal((await owner("get", "/staff")).body.users.length, 0);
  const customers = await owner("get", "/staff/customers?q=reader").expect(200);
  assert.equal(customers.body.users[0].id, customer.user.id);
  assert.equal(customers.body.users[0].addresses, undefined);
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "catalog", disabled: false, expected: { role: "customer", disabled: false } }).expect(200);
  await customer.agent.get("/api/account").expect(401);
  await customer.agent.post("/api/auth/login").send({ email: customer.user.email, password }).expect(200);
  const secondSession = request.agent(app);
  await secondSession.post("/api/auth/login").send({ email: customer.user.email, password }).expect(200);
  const detail = await owner("get", `/staff/${customer.user.id}`).expect(200);
  assert.equal(detail.body.user.activeSessions, 2);
  assert.ok(detail.body.user.lastLoginAt);
  assert.equal(detail.body.user.authVersion, undefined);
  assert.equal(detail.body.sessions, undefined);
  assert.equal(detail.body.activity[0].change.beforeRole, "customer");
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "orders", disabled: false, expected: { role: "customer", disabled: false } }).expect(409);
  // Saving identical permissions must not sign out active staff.
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "catalog", disabled: false }).expect(200);
  await secondSession.get("/api/admin/catalog").expect(200);
  await owner("post", `/staff/${customer.user.id}/revoke-sessions`).send({}).expect(200);
  await customer.agent.get("/api/admin/catalog").expect(401);
  await secondSession.get("/api/account").expect(401);
  const revoked = await owner("get", `/staff/${customer.user.id}`).expect(200);
  assert.equal(revoked.body.user.activeSessions, 0);
  assert.equal(revoked.body.activity[0].action, "staff.sessions-revoked");
  await customer.agent.post("/api/auth/login").send({ email: customer.user.email, password }).expect(200);
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "owner", disabled: false }).expect(200);
  assert.equal((await owner("get", `/staff/${customer.user.id}`)).body.isLastOwner, true);
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "customer", disabled: false }).expect(409);
  await owner("patch", `/staff/${customer.user.id}`).send({ role: "owner", disabled: true }).expect(409);
  assert.equal((await store.snapshot()).users.find((user) => user.id === customer.user.id)!.disabled, false);
});
test("creating a book returns its server-generated ID and the editor loads that one saved record", async (t) => {
  const { app, owner, store } = await setup(t);
  const original = (await store.products())[0];
  const draft = { ...original, slug: "an-editor-test-book", title: "Editor test book" };
  await request(app).get(`/api/admin/products/${original.id}`).expect(401);
  await request(app).post("/api/admin/products").send(draft).expect(401);
  const created = await owner("post", "/products").send(draft).expect(201);
  const book = created.body.product;
  assert.match(book.id, /^book-/);
  assert.notEqual(book.id, original.id);
  const detail = await owner("get", `/products/${book.id}`).expect("Cache-Control", "private, no-store").expect(200);
  assert.deepEqual(detail.body, { product: book, assets: [] });
  await owner("get", "/products/nonexistent-book").expect(404);
  await owner("put", `/products/${book.id}`).send({ ...book, title: "Updated editor test book" }).expect(200);
  assert.equal((await owner("get", `/products/${book.id}`).expect(200)).body.product.title, "Updated editor test book");
  assert.equal((await owner("get", `/products/${original.id}`).expect(200)).body.product.title, original.title);
});
test("unconfigured recovery is honest; email verification/reset are single-use and revoke sessions", async (t) => {
  const disabled = await setup(t); const a = await disabled.register();
  const unavailable = await a.agent.post("/api/auth/forgot").send({ email: a.user.email }).expect(200); assert.equal(unavailable.body.deliveryAvailable, false); assert.equal((await disabled.store.snapshot()).tokens.length, 0);
  const delivered: OutboxMessage[] = []; const mailer: Mailer = { available: true, async send(m) { delivered.push(m); } };
  const enabled = await setup(t, mailer); const b = await enabled.register(); await flushOutbox(enabled.store, mailer);
  const verify = delivered.find((m) => m.type === "verify")!.text.match(/token=([a-f0-9]{64})/)![1];
  await b.agent.post("/api/auth/verify").send({ token: verify }).expect(200); await b.agent.post("/api/auth/verify").send({ token: verify }).expect(400);
  await b.agent.post("/api/auth/forgot").send({ email: b.user.email }).expect(200); await flushOutbox(enabled.store, mailer);
  const token = delivered.find((m) => m.type === "reset")!.text.match(/token=([a-f0-9]{64})/)![1];
  await b.agent.post("/api/auth/reset").send({ token, password: "New-Password-123456" }).expect(200); await b.agent.get("/api/account").expect(401);
  await b.agent.post("/api/auth/reset").send({ token, password }).expect(400);
  await b.agent.post("/api/auth/login").send({ email: b.user.email, password }).expect(401);
  await b.agent.post("/api/auth/login").send({ email: b.user.email, password: "New-Password-123456" }).expect(200);
  assert.ok((await enabled.store.snapshot()).outbox.every((m) => !m.text.includes("token=")));
});
test("verified reviews require a delivered non-demo owned purchase and renewed moderation after edit", async (t) => {
  const { store, register, owner, app } = await setup(t); const a = await register();
  await a.agent.post("/api/books/b001/reviews").send({ rating: 5, text: "এই নমুনা মতামতটি যাচাই করার জন্য লেখা।" }).expect(403);
  await store.transaction((d) => { const o = reserveOrder(d, orderInput, true, a.user.id); o.status = "delivered"; });
  await a.agent.post("/api/books/b001/reviews").send({ rating: 5, text: "ডেমো অর্ডার থেকে রিভিউ দেওয়া যাবে না।" }).expect(403);
  await store.transaction((d) => { d.orders[0].demo = false; });
  const submitted = await a.agent.post("/api/books/b001/reviews").send({ rating: 5, text: "পরীক্ষার জন্য লেখা পাঠকের একটি সম্পূর্ণ নমুনা মতামত।" }).expect(201);
  assert.equal((await request(app).get("/api/books/b001/reviews")).body.reviews.length, 0);
  await owner("patch", `/reviews/${submitted.body.review.id}`).send({ status: "approved", note: "যাচাই হয়েছে" }).expect(200);
  const list = await request(app).get("/api/books/b001/reviews"); assert.equal(list.body.reviews[0].verified, true); assert.ok(!("userId" in list.body.reviews[0]));
  const p = (await request(app).get("/api/products")).body.products.find((p: { id: string }) => p.id === "b001"); assert.deepEqual(p.rating, { average: 5, count: 1 });
  await store.transaction((d) => { d.reviews[0].updatedAt = "2000-01-01T00:00:00Z"; });
  await a.agent.post("/api/books/b001/reviews").send({ rating: 4, text: "পরিবর্তিত নমুনা মতামত আবার পর্যালোচনা করতে হবে।" }).expect(201);
  assert.equal((await request(app).get("/api/books/b001/reviews")).body.reviews.length, 0);
  await a.agent.post("/api/books/b001/reviews").send({ rating: 4, text: "একই মুহূর্তে আবার রিভিউ সম্পাদনা প্রত্যাখ্যান করুন।" }).expect(429);
});
test("upload validation, private previews, rights gating, ordering and deletion protect media", async (t) => {
  const { app, store, owner } = await setup(t);
  const png = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#d0dfc0" } }).png().toBuffer();
  await request(app).post("/api/admin/media").field("kind", "cover").field("productId", "b001").attach("file", png, { filename: "test.png", contentType: "image/png" }).expect(401);
  await owner("post", "/media").field("kind", "cover").field("productId", "b001").attach("file", Buffer.from("<svg onload='alert(1)'/>"), { filename: "fake.png", contentType: "image/png" }).expect(400);
  await owner("post", "/media").field("kind", "preview").field("productId", "b001").attach("file", Buffer.from("%PDF-fake"), { filename: "fake.pdf", contentType: "application/pdf" }).expect(400);
  await owner("post", "/media").field("kind", "cover").field("productId", "b001").attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), { filename: "oversized.png", contentType: "image/png" }).expect(400);
  const cover = await owner("post", "/media").field("kind", "cover").field("productId", "b001").attach("file", png, { filename: "cover.png", contentType: "image/png" }).expect(201);
  await request(app).get(`/api/media/${cover.body.asset.id}`).expect(404);
  const pdf = await PDFDocument.create(); pdf.addPage().drawText("Original, self-authored test preview. Page 1"); pdf.addPage().drawText("Original test page 2"); const pdfBytes = Buffer.from(await pdf.save());
  const preview = await owner("post", "/media").field("kind", "preview").field("productId", "b001").attach("file", pdfBytes, { filename: "preview.pdf", contentType: "application/pdf" }).expect(201);
  const p = (await store.products())[0]; const draft = { ...p, coverAssetId: cover.body.asset.id, previewAssetIds: [preview.body.asset.id], previewPermission: false };
  await owner("put", "/products/b001").send(draft).expect(200); await request(app).get(`/api/media/${cover.body.asset.id}`).expect(200).expect("Content-Type", /image\/webp/);
  assert.equal((await request(app).get("/api/books/b001/preview")).body.assets.length, 0); await request(app).get(`/api/media/${preview.body.asset.id}`).expect(404);
  await owner("put", "/products/b001").send({ ...draft, previewPermission: true }).expect(400);
  await owner("put", "/products/b001").send({ ...draft, previewPermission: true, previewPermissionNote: "Self-authored original test material", pages: 2 }).expect(400);
  await owner("put", "/products/b001").send({ ...draft, previewPermission: true, previewPermissionNote: "Self-authored original test material" }).expect(200);
  await request(app).get(`/api/media/${preview.body.asset.id}`).expect(200).expect("Content-Type", /application\/pdf/);
  await owner("delete", `/media/${preview.body.asset.id}`).expect(409);
  await owner("put", "/products/b001").send({ ...draft, previewAssetIds: [] }).expect(200); await owner("delete", `/media/${preview.body.asset.id}`).expect(200); await request(app).get(`/api/media/${preview.body.asset.id}`).expect(404);
});
test("collections preserve editorial order and keep unpublished collections private", async (t) => {
  const { app, owner } = await setup(t);
  const c = { id: "custom-collection", slug: "custom-selection", title: "বাছাই করা বই", description: "পাঠকের জন্য নিজস্ব একটি নমুনা সংগ্রহ।", reason: "বিষয় ও পাঠের সহজতার ভিত্তিতে নির্বাচন।", productIds: ["b002", "b001"], published: false, featured: true, sortOrder: 1 };
  await owner("put", `/collections/${c.id}`).send(c).expect(200); await request(app).get(`/api/collections/${c.slug}`).expect(404);
  await owner("put", `/collections/${c.id}`).send({ ...c, productIds: ["b001", "b001"] }).expect(400);
  await owner("put", `/collections/${c.id}`).send({ ...c, published: true }).expect(200);
  assert.deepEqual((await request(app).get(`/api/collections/${c.slug}`)).body.collection.productIds, ["b002", "b001"]);
});
test("restock events deduplicate subscriptions and notifications; unconfigured email is never marked sent", async (t) => {
  const { register, store, owner } = await setup(t); const a = await register(); const p = (await store.products())[0];
  await store.transaction((d) => { d.users[0].emailVerified = true; });
  await owner("put", "/products/b001").send({ ...p, stock: 0 }).expect(200);
  for (let i = 0; i < 2; i++) await a.agent.put("/api/account/subscriptions/b001").send({ active: true }).expect(200);
  await owner("put", "/products/b001").send({ ...p, stock: 10 }).expect(200); await owner("put", "/products/b001").send({ ...p, stock: 12 }).expect(200);
  let d = await store.snapshot(); assert.equal(d.subscriptions.length, 1); assert.equal(d.notifications.length, 1); assert.equal(d.outbox[0].status, "unavailable");
  await flushOutbox(store, noMail); assert.equal((await store.snapshot()).outbox[0].status, "unavailable");
  await owner("put", "/products/b001").send({ ...p, stock: 0 }).expect(200); await owner("put", "/products/b001").send({ ...p, stock: 1 }).expect(200);
  d = await store.snapshot(); assert.equal(d.notifications.length, 2);
  await a.agent.put("/api/account/subscriptions/b001").send({ active: false }).expect(200);
});

test("adding stock is atomic, idempotent, permission checked and recorded with staff identity", async (t) => {
  const { owner, register, app, store } = await setup(t);
  const { agent, user } = await register();
  const original = (await store.products())[0];
  await owner("put", `/products/${original.id}`).send({ ...original, stock: 0 }).expect(200);
  await agent.put(`/api/account/subscriptions/${original.id}`).send({ active: true }).expect(200);
  const addition = { quantity: 3, requestId: randomUUID() };
  await request(app).post(`/api/admin/products/${original.id}/stock`).send(addition).expect(401);
  await agent.get(`/api/admin/products/${original.id}/stock-history`).expect(401);
  await owner("patch", `/staff/${user.id}`).send({ role: "catalog", disabled: false }).expect(200);
  await agent.post("/api/auth/login").send({ email: user.email, password }).expect(200);
  const repeated = await Promise.all([
    agent.post(`/api/admin/products/${original.id}/stock`).send(addition),
    agent.post(`/api/admin/products/${original.id}/stock`).send(addition),
  ]);
  assert.deepEqual(repeated.map((response) => response.status), [200, 200]);
  assert.equal((await store.products())[0].stock, 3);
  await agent.post(`/api/admin/products/${original.id}/stock`).send({ ...addition, quantity: 4 }).expect(409);
  await agent.post("/api/admin/products/b002/stock").send(addition).expect(409);
  const independent = await Promise.all([
    agent.post(`/api/admin/products/${original.id}/stock`).send({ quantity: 4, requestId: randomUUID() }),
    agent.post(`/api/admin/products/${original.id}/stock`).send({ quantity: 5, requestId: randomUUID() }),
    request(app).post("/api/orders").send(orderInput),
  ]);
  assert.deepEqual(independent.map((response) => response.status), [200, 200, 201]);
  assert.equal((await store.products())[0].stock, 11);
  assert.equal((await store.snapshot()).notifications.length, 1);
  const history = await agent.get(`/api/admin/products/${original.id}/stock-history`).expect("Cache-Control", "private, no-store").expect(200);
  const additions = history.body.entries.filter((entry: { change: { added?: number } }) => entry.change.added);
  assert.equal(additions.length, 3);
  assert.ok(additions.every((entry: { actorName: string }) => entry.actorName === user.name));
  assert.equal(history.body.entries.find((entry: { change: { after: number } }) => entry.change.after === 0).change.before, original.stock);
  assert.equal(history.body.entries[0].change.requestId, undefined);
  for (const quantity of [0, -1, 1.2, 100001]) {
    await agent.post(`/api/admin/products/${original.id}/stock`).send({ quantity, requestId: randomUUID() }).expect(400);
  }
  await agent.post(`/api/admin/products/${original.id}/stock`).send({ quantity: 100000, requestId: randomUUID() }).expect(409);
  await agent.post("/api/admin/products/missing/stock").send({ quantity: 1, requestId: randomUUID() }).expect(404);
  await owner("patch", `/staff/${user.id}`).send({ role: "orders", disabled: false }).expect(200);
  await agent.post("/api/auth/login").send({ email: user.email, password }).expect(200);
  await agent.post(`/api/admin/products/${original.id}/stock`).send({ quantity: 1, requestId: randomUUID() }).expect(403);
  await agent.get(`/api/admin/products/${original.id}/stock-history`).expect(403);
});

test("inventory separates invoices, partial receiving and supplier payments with atomic retries", async (t) => {
  const { owner, store, app, register } = await setup(t);
  await store.transaction((data) => { data.products[0].stock = 0; data.products[1].stock = 0; });
  const supplier = (await owner("post", "/inventory/suppliers").send({ name: "Example Publisher", phone: "01700000000" }).expect(201)).body.supplier;
  const input = {
    supplierId: supplier.id, invoiceNo: "BILL-101", date: "2026-11-19",
    lines: [{ productId: "b001", quantity: 10, unitCost: 180 }, { productId: "b002", quantity: 5, unitCost: 200 }],
    discount: 100, freight: 200, requestId: randomUUID(),
  };
  const purchase = (await owner("post", "/inventory/purchases").send(input).expect(201)).body.purchase;
  assert.equal(purchase.totalMinor, 290000);
  assert.equal((await store.products())[0].stock, 0);
  assert.equal((await owner("post", "/inventory/purchases").send(input).expect(201)).body.purchase.id, purchase.id);
  await owner("post", "/inventory/purchases").send({ ...input, discount: 99 }).expect(409);
  await owner("post", "/inventory/purchases").send({ ...input, requestId: randomUUID() }).expect(409);
  const payment = { amount: 500, reference: "ADVANCE-1", method: "bank", date: input.date, requestId: randomUUID() };
  await owner("post", `/inventory/purchases/${purchase.id}/payments`).send(payment).expect(201);
  await owner("post", `/inventory/purchases/${purchase.id}/payments`).send(payment).expect(201);
  assert.equal((await store.snapshot()).supplierPayments.length, 1);
  await owner("post", `/inventory/purchases/${purchase.id}/payments`).send({ ...payment, requestId: randomUUID() }).expect(409);
  await owner("post", `/inventory/purchases/${purchase.id}/payments`).send({ ...payment, amount: 2400.01, reference: "OVER", requestId: randomUUID() }).expect(409);
  const first = { items: [{ productId: "b001", quantity: 4 }, { productId: "b002", quantity: 2 }], requestId: randomUUID() };
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send(first).expect(200);
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send(first).expect(200);
  assert.equal((await store.products())[0].stock, 4);
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send({ ...first, items: [{ productId: "b001", quantity: 2 }] }).expect(409);
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send({
    items: [{ productId: "b001", quantity: 1 }, { productId: "b002", quantity: 100 }], requestId: randomUUID(),
  }).expect(409);
  assert.equal((await store.products())[0].stock, 4);
  const remaining = { items: [{ productId: "b001", quantity: 6 }, { productId: "b002", quantity: 3 }], requestId: randomUUID() };
  const receiving = await Promise.all([
    owner("post", `/inventory/purchases/${purchase.id}/receive`).send(remaining),
    owner("post", `/inventory/purchases/${purchase.id}/receive`).send(remaining),
  ]);
  assert.deepEqual(receiving.map((response) => response.status), [200, 200]);
  assert.equal((await store.products())[0].stock, 10);
  assert.equal((await store.products())[1].stock, 5);
  await owner("post", `/inventory/purchases/${purchase.id}/payments`).send({ ...payment, amount: 2400, reference: "FINAL", requestId: randomUUID() }).expect(201);
  const overview = await owner("get", "/inventory").expect("Cache-Control", "private, no-store").expect(200);
  assert.equal(overview.body.purchases[0].receipts.length, 2);
  assert.equal(overview.body.payments.reduce((sum: number, row: { amountMinor: number }) => sum + row.amountMinor, 0), 290000);
  assert.equal(overview.body.movements.filter((entry: { action: string }) => entry.action === "purchase.received").length, 4);
  const reader = await register();
  await reader.agent.get("/api/admin/inventory").expect(401);
  await owner("patch", `/staff/${reader.user.id}`).send({ role: "catalog", disabled: false }).expect(200);
  await reader.agent.post("/api/auth/login").send({ email: reader.user.email, password }).expect(200);
  await reader.agent.get("/api/admin/inventory").expect(403);
  await request(app).get("/api/admin/inventory").expect(401);
});

test("inventory due dates validate, persist, audit changes and reject stale edits", async (t) => {
  const { owner, store, register, app } = await setup(t);
  const supplier = (await owner("post", "/inventory/suppliers").send({ name: "Due date Supplier" }).expect(201)).body.supplier;
  const input = { supplierId: supplier.id, date: "2026-11-19", dueDate: "2026-11-25", lines: [{ productId: "b001", quantity: 1, unitCost: 100 }], requestId: randomUUID() };
  await owner("post", "/inventory/purchases").send({ ...input, dueDate: "2026-11-18" }).expect(400);
  const purchase = (await owner("post", "/inventory/purchases").send(input).expect(201)).body.purchase;
  assert.equal(purchase.dueDate, "2026-11-25");
  const url = `/inventory/purchases/${purchase.id}/due-date`;
  await owner("put", url).send({ dueDate: "2026-11-18", expected: input.dueDate }).expect(400);
  await owner("put", url).send({ dueDate: "2026-11-26", expected: input.dueDate }).expect(200);
  await owner("put", url).send({ dueDate: "2026-11-26", expected: input.dueDate }).expect(200);
  await owner("put", url).send({ dueDate: "2026-11-27", expected: input.dueDate }).expect(409);
  await owner("put", url).send({ dueDate: "invalid", expected: "2026-11-26" }).expect(400);
  await owner("put", url).send({ dueDate: null, expected: "2026-11-26" }).expect(200);
  assert.equal((await store.snapshot()).purchases[0].dueDate, undefined);
  assert.equal((await store.snapshot()).audit.filter((entry) => entry.action === "purchase.due-date").length, 2);
  await owner("put", "/inventory/purchases/missing/due-date").send({ dueDate: null, expected: null }).expect(404);
  const editor = await register();
  await owner("patch", `/staff/${editor.user.id}`).send({ role: "catalog", disabled: false }).expect(200);
  await editor.agent.post("/api/auth/login").send({ email: editor.user.email, password }).expect(200);
  await editor.agent.put(`/api/admin${url}`).send({ dueDate: null, expected: null }).expect(403);
  await request(app).put(`/api/admin${url}`).send({ dueDate: null, expected: null }).expect(401);
});

test("inventory stores exact minor-unit costs, protects invoice files and audits reasoned adjustments", async (t) => {
  const { app, owner, store } = await setup(t);
  const supplier = (await owner("post", "/inventory/suppliers").send({ name: "Decimal Supplier" }).expect(201)).body.supplier;
  const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const asset = (await owner("post", "/inventory/receipts").attach("file", image, { filename: "bill.png", contentType: "image/png" }).expect(201)).body.asset;
  assert.equal(asset.kind, "receipt");
  await request(app).get(`/api/media/${asset.id}`).expect(404);
  const downloaded = await owner("get", `/inventory/receipts/${asset.id}`).expect(200);
  assert.deepEqual(Buffer.from(downloaded.body.base64, "base64"), image);
  const catalog = await owner("get", "/catalog").expect(200);
  assert.equal(catalog.body.assets.some((item: { id: string }) => item.id === asset.id), false);
  const input = { supplierId: supplier.id, date: "2026-11-19", lines: [{ productId: "b001", quantity: 3, unitCost: .1 }], requestId: randomUUID(), receiptAssetId: asset.id };
  const purchase = (await owner("post", "/inventory/purchases").send(input).expect(201)).body.purchase;
  assert.equal(purchase.totalMinor, 30);
  await owner("post", "/inventory/purchases").send({ ...input, requestId: randomUUID(), discount: .31 }).expect(400);
  const before = (await store.products())[0].stock;
  const adjustment = { productId: "b001", delta: -2, reason: "Two copies damaged", requestId: randomUUID() };
  await owner("post", "/inventory/adjustments").send(adjustment).expect(200);
  await owner("post", "/inventory/adjustments").send(adjustment).expect(200);
  assert.equal((await store.products())[0].stock, before - 2);
  await owner("post", "/inventory/adjustments").send({ ...adjustment, delta: -100000, requestId: randomUUID() }).expect(409);
  const movement = (await owner("get", "/inventory")).body.movements[0];
  assert.equal(movement.note, adjustment.reason);
  assert.equal(movement.change.before, before);
});
test("preorders enforce server prices, explicit terms, separate quotas and ready-before-shipping", async (t) => {
  const { register, store, owner } = await setup(t); const a = await register(); const p = (await store.products())[0];
  const preorder = { enabled: true, price: 199, limit: 2, reserved: 0, publicationDate: "2027-01-01", dispatchDate: "2027-01-05", cancellationTerms: "পাঠানোর আগে অনুরোধ করে প্রি-অর্ডার বাতিল করা যাবে।" };
  await owner("put", "/products/b001").send({ ...p, stock: 0, preorder }).expect(200);
  await a.agent.post("/api/orders").send(orderInput).expect(400);
  const results = await Promise.all([a.agent.post("/api/orders").send({ ...orderInput, items: [{ productId: "b001", quantity: 2 }], acceptPreorderTerms: true }), a.agent.post("/api/orders").send({ ...orderInput, items: [{ productId: "b001", quantity: 2 }], acceptPreorderTerms: true })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]); const o = results.find((r) => r.status === 201)!.body.order;
  assert.equal(o.subtotal, 398); assert.equal(o.preorderStatus, "awaiting-release"); assert.equal((await store.products())[0].stock, 0);
  await owner("put", "/products/b001").send({ ...p, stock: 0, preorder: { ...preorder, reserved: 0 } }).expect(200); assert.equal((await store.products())[0].preorder!.reserved, 2);
  await owner("patch", `/orders/${o.id}`).send({ status: "confirmed" }).expect(200); await owner("patch", `/orders/${o.id}`).send({ status: "shipped" }).expect(409);
  await owner("patch", `/orders/${o.id}/preorder-ready`).send({}).expect(200); await owner("patch", `/orders/${o.id}`).send({ status: "shipped" }).expect(200);
  await owner("patch", `/orders/${o.id}`).send({ status: "delivered" }).expect(200);
  assert.equal((await store.snapshot()).orders[0].preorderStatus, "fulfilled");
});
test("mixed preorder cancellations restore each inventory exactly once and date changes notify owners", async (t) => {
  const { register, store, owner } = await setup(t); const a = await register(); const p = (await store.products())[0]; const preorder = { enabled: true, price: 199, limit: 5, reserved: 0, publicationDate: "2027-01-01", dispatchDate: "2027-01-05", cancellationTerms: "অর্ডার পাঠানোর আগে যোগাযোগ করুন।" };
  await owner("put", "/products/b001").send({ ...p, stock: 0, preorder }).expect(200);
  const created = await a.agent.post("/api/orders").send({ ...orderInput, items: [{ productId: "b001", quantity: 1 }, { productId: "b002", quantity: 1 }], acceptPreorderTerms: true }).expect(201);
  assert.match(created.body.order.fulfillmentPolicy, /একসঙ্গে/); assert.equal((await store.products())[1].stock, 19);
  await owner("put", "/products/b001").send({ ...p, stock: 0, preorder: { ...preorder, dispatchDate: "2027-02-01" } }).expect(200);
  assert.equal((await store.snapshot()).orders[0].items[0].dispatchDate, "2027-02-01"); assert.equal((await a.agent.get("/api/account")).body.notifications.length, 1);
  await owner("patch", `/orders/${created.body.order.id}`).send({ status: "cancelled" }).expect(200); await owner("patch", `/orders/${created.body.order.id}`).send({ status: "cancelled" }).expect(409);
  assert.equal((await store.products())[0].preorder!.reserved, 0); assert.equal((await store.products())[1].stock, 20);
});
test("returns, payment reconciliation and refunds enforce quantity and monetary limits atomically", async (t) => {
  const { store, register, owner } = await setup(t); const a = await register(); const b = await register("outsider@example.test");
  const o = await store.transaction((d) => { const order = reserveOrder(d, orderInput, false, a.user.id); order.status = "delivered"; return order; });
  await b.agent.post("/api/account/returns").send({ orderId: o.id, reason: "পরীক্ষার জন্য বই ফেরত দিতে চাই।", items: orderInput.items }).expect(404);
  const returned = await a.agent.post("/api/account/returns").send({ orderId: o.id, reason: "পরীক্ষার জন্য বই ফেরত দিতে চাই।", items: orderInput.items }).expect(201); const r = returned.body.request;
  await a.agent.post("/api/account/returns").send({ orderId: o.id, reason: "একই বই দ্বিতীয়বার ফেরত দেওয়া যাবে না।", items: orderInput.items }).expect(409);
  await owner("patch", `/returns/${r.id}`).send({ status: "approved" }).expect(200); await owner("patch", `/returns/${r.id}`).send({ status: "received", restock: true }).expect(200); await owner("patch", `/returns/${r.id}`).send({ status: "received", restock: true }).expect(409);
  assert.equal((await store.products())[0].stock, 20);
  await owner("post", "/payments").send({ orderId: o.id, amount: 511, reference: "payment-1", method: "cod", confirmedManual: true }).expect(409);
  await owner("post", "/payments").send({ orderId: o.id, amount: 510, reference: "payment-1", method: "cod", confirmedManual: true }).expect(201);
  await owner("post", "/refunds").send({ returnId: r.id, amount: 451, method: "cash" }).expect(409);
  const refunds = await Promise.all([owner("post", "/refunds").send({ returnId: r.id, amount: 450, method: "cash" }), owner("post", "/refunds").send({ returnId: r.id, amount: 450, method: "cash" })]); assert.deepEqual(refunds.map((r) => r.status).sort(), [201, 409]);
  const refund = refunds.find((r) => r.status === 201)!.body.refund;
  await owner("patch", `/refunds/${refund.id}`).send({ status: "completed", reference: "refund-1", confirmedManual: false }).expect(400);
  await owner("patch", `/refunds/${refund.id}`).send({ status: "completed", reference: "refund-1", confirmedManual: true }).expect(200);
  await owner("patch", `/refunds/${refund.id}`).send({ status: "completed", reference: "refund-1", confirmedManual: true }).expect(409);
  const report = (await owner("get", "/dashboard").expect(200)).body; assert.equal(report.collected, 510); assert.equal(report.refunded, 450); assert.equal(report.netCollected, 60); assert.equal(report.outstanding, 0);
  assert.equal(report.salesTrend.reduce((total: number, period: { net: number }) => total + period.net, 0), 60);
  assert.deepEqual(report.recentOrders[0], { id: o.id, createdAt: o.createdAt, total: 510, status: "delivered", demo: false, customerName: customer.name, quantity: 1 });
  const empty = (await owner("get", "/dashboard?from=2000-01-01&to=2000-01-31").expect(200)).body;
  assert.deepEqual(empty.salesTrend, []); assert.deepEqual(empty.recentOrders, []);
  await owner("get", "/dashboard?from=2001-01-01&to=2000-01-01").expect(400);
  const log = (await owner("get", "/audit")).body.entries; assert.ok(log.some((e: { action: string }) => e.action === "refund.manual-completed")); assert.ok(!JSON.stringify(log).includes(password));
});
test("legacy data migrates without losing books, stock or historical guest orders", async (t) => {
  const { store, filename, register } = await setup(t); const initial = await store.snapshot(); initial.products[0].stock = 7;
  await writeFile(filename, JSON.stringify({ products: initial.products, orders: [] })); await register();
  const d = await store.snapshot(); assert.equal(d.products[0].stock, 7); assert.equal(d.users.length, 1); assert.ok(d.collections.length > 0);
});
test("outbox leases deduplicate workers, retry transient failures and require explicit requeue after exhaustion", async (t) => {
  let attempts = 0;
  const mailer: Mailer = { available: true, async send() { attempts++; if (attempts === 1) throw new Error("Temporary failure"); } };
  const { store, owner } = await setup(t, mailer);
  await store.transaction((d) => { d.outbox.push({ id: "isolated-outbox", userId: "isolated-user", to: "nobody@example.test", subject: "Local test", text: "Local test only", type: "restock", status: "pending", attempts: 0, nextAttemptAt: new Date(0).toISOString(), createdAt: new Date().toISOString() }); });
  await Promise.all([flushOutbox(store, mailer), flushOutbox(store, mailer)]);
  assert.equal(attempts, 1); assert.equal((await store.snapshot()).outbox[0].status, "pending");
  await store.transaction((d) => { d.outbox[0].nextAttemptAt = new Date(0).toISOString(); });
  await Promise.all([flushOutbox(store, mailer), flushOutbox(store, mailer)]); assert.equal(attempts, 2); assert.equal((await store.snapshot()).outbox[0].status, "sent");
  await store.transaction((d) => { Object.assign(d.outbox[0], { status: "failed", attempts: 5 }); });
  await owner("post", "/outbox/isolated-outbox/requeue").send({}).expect(200);
  assert.equal((await store.snapshot()).outbox[0].attempts, 0);
});
test("the last owner cannot be disabled and expired identity links cannot be consumed", async (t) => {
  const { store, owner, register } = await setup(t); const a = await register();
  await owner("patch", `/staff/${a.user.id}`).send({ role: "owner", disabled: false }).expect(200);
  await owner("patch", `/staff/${a.user.id}`).send({ role: "customer", disabled: true }).expect(409);
  await store.transaction((d) => { d.tokens.push({ id: tokenHash("0".repeat(64)), userId: a.user.id, purpose: "reset", expiresAt: "2000-01-01T00:00:00Z" }); });
  await a.agent.post("/api/auth/reset").send({ token: "0".repeat(64), password }).expect(400);
});
