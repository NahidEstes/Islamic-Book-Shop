import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectStore, seedMongo } from "../server/store";
import { createApp } from "../server/app";

test("MongoDB replica-set persistence, inventory transactions, sessions and role enforcement", { timeout: 240000 }, async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  try {
    const store = await connectStore(repl.getUri(), false); await seedMongo();
    const key = "replica-set-test-owner-key-over-24-chars";
    const app = createApp(store, key, { mailer: { available: true, async send() {} } });
    const agent = request.agent(app);
    const registered = await agent.post("/api/auth/register").send({ name: "Mongo Test Reader", email: "mongo@example.test", password: "Mongo-Password-123456" }).expect(201);
    assert.equal((await agent.get("/api/account")).body.user.id, registered.body.user.id);
    const input = { customer: { name: "Mongo Reader", phone: "01700000000", address: "Isolated test address, house 10", city: "Dhaka", zone: "dhaka" }, items: [{ productId: "b001", quantity: 20 }], paymentMethod: "cod" };
    const pair = await Promise.all([agent.post("/api/orders").send(input), agent.post("/api/orders").send(input)]);
    assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]); assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 0);
    const order = pair.find((r) => r.status === 201)!.body.order;
    await request(app).patch(`/api/admin/orders/${order.id}`).set("Authorization", `Bearer ${key}`).send({ status: "cancelled" }).expect(200);
    assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 20);
    assert.ok((await store.snapshot()).audit.some((a) => a.action === "order.cancelled"));
    const invited = await request(app).post("/api/admin/staff/invitations").set("Authorization", `Bearer ${key}`).send({
      name: "Mongo Editor", email: "mongo-editor@example.test", role: "catalog",
    }).expect(201);
    assert.equal((await store.snapshot()).staffInvitations[0].id, invited.body.invitation.id);
    const inviteToken = (await store.snapshot()).outbox.find((message) => message.type === "invite")!.text.match(/token=([a-f0-9]{64})/)![1];
    await request(app).post("/api/auth/accept-invite").send({ token: inviteToken, password: "Mongo-Editor-Password-123" }).expect(200);
    const persistedInvitation = (await store.snapshot()).staffInvitations[0];
    assert.ok(persistedInvitation.acceptedAt);
    const detail = await request(app).get(`/api/admin/staff/${persistedInvitation.userId}`).set("Authorization", `Bearer ${key}`).expect(200);
    assert.equal(detail.body.user.role, "catalog");
    const stockRequest = { quantity: 2, requestId: randomUUID() };
    const additions = await Promise.all([
      request(app).post("/api/admin/products/b001/stock").set("Authorization", `Bearer ${key}`).send(stockRequest),
      request(app).post("/api/admin/products/b001/stock").set("Authorization", `Bearer ${key}`).send(stockRequest),
    ]);
    assert.deepEqual(additions.map((response) => response.status), [200, 200]);
    assert.equal((await store.products()).find((book) => book.id === "b001")!.stock, 22);
    const stockHistory = await request(app).get("/api/admin/products/b001/stock-history").set("Authorization", `Bearer ${key}`).expect(200);
    assert.equal(stockHistory.body.entries.filter((entry: { change: { added?: number } }) => entry.change.added === 2).length, 1);
    const supplier = await request(app).post("/api/admin/inventory/suppliers").set("Authorization", `Bearer ${key}`).send({ name: "Mongo Supplier" }).expect(201);
    const purchase = await request(app).post("/api/admin/inventory/purchases").set("Authorization", `Bearer ${key}`).send({
      supplierId: supplier.body.supplier.id, date: "2026-11-19", lines: [{ productId: "b001", quantity: 5, unitCost: 100 }], requestId: randomUUID(),
    }).expect(201);
    await request(app).put(`/api/admin/inventory/purchases/${purchase.body.purchase.id}/due-date`).set("Authorization", `Bearer ${key}`).send({ dueDate: "2026-11-30", expected: null }).expect(200);
    assert.equal((await store.snapshot()).purchases[0].dueDate, "2026-11-30");
    const receipt = { items: [{ productId: "b001", quantity: 5 }], requestId: randomUUID() };
    const receipts = await Promise.all([
      request(app).post(`/api/admin/inventory/purchases/${purchase.body.purchase.id}/receive`).set("Authorization", `Bearer ${key}`).send(receipt),
      request(app).post(`/api/admin/inventory/purchases/${purchase.body.purchase.id}/receive`).set("Authorization", `Bearer ${key}`).send(receipt),
    ]);
    assert.deepEqual(receipts.map((response) => response.status), [200, 200]);
    assert.equal((await store.products()).find((book) => book.id === "b001")!.stock, 27);
    const payment = { amount: 400, reference: "CONCURRENT", method: "cash", date: "2026-11-19", requestId: randomUUID() };
    const payments = await Promise.all([
      request(app).post(`/api/admin/inventory/purchases/${purchase.body.purchase.id}/payments`).set("Authorization", `Bearer ${key}`).send(payment),
      request(app).post(`/api/admin/inventory/purchases/${purchase.body.purchase.id}/payments`).set("Authorization", `Bearer ${key}`).send({ ...payment, reference: "OTHER", requestId: randomUUID() }),
    ]);
    assert.deepEqual(payments.map((response) => response.status).sort(), [201, 409]);
    assert.equal((await store.snapshot()).supplierPayments.length, 1);
    const businessOwner = (method: "get" | "post" | "put", url: string) => request(app)[method]("/api/admin" + url).set("Authorization", `Bearer ${key}`);
    const coupon = (await businessOwner("post", "/coupons").send({ code: "MONGO10", type: "percent", value: 10, minimumMinor: 0, starts: "2020-01-01", ends: "2099-12-31", active: true, limit: 1, productIds: [] }).expect(201)).body.coupon;
    assert.equal((await store.snapshot()).coupons[0].id, coupon.id);
    await businessOwner("post", "/reports/expenses").send({ date: "2026-11-19", category: "packaging", amountMinor: 2500, note: "Mongo expense", reference: "MONGO-EXP", requestId: randomUUID() }).expect(201);
    assert.equal((await businessOwner("get", "/reports").expect(200)).body.expensesMinor, 2500);
    const csv = 'id,price\nb001,440';
    const preview = (await businessOwner("post", "/catalog/import/preview").send({ csv }).expect(200)).body;
    await businessOwner("post", "/catalog/import/commit").send({ csv, fingerprint: preview.fingerprint, requestId: randomUUID() }).expect(200);
    const businessState = await store.snapshot();
    assert.equal(businessState.products.find((p) => p.id === "b001")!.price, 440);
    assert.equal(businessState.products.find((p) => p.id === "b001")!.stockCost!.valueMinor, 50000);
    assert.equal(businessState.imports.length, 1);
    await agent.get("/api/admin/orders").expect(401);
    await agent.post("/api/auth/logout").send({}).expect(200); await agent.get("/api/account").expect(401);
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
