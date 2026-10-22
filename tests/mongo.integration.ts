import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectStore, seedMongo } from "../server/store";
import { createApp } from "../server/app";

test("MongoDB replica-set persistence, inventory transactions, sessions and role enforcement", { timeout: 240000 }, async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  try {
    const store = await connectStore(repl.getUri(), false); await seedMongo();
    const key = "replica-set-test-owner-key-over-24-chars"; const app = createApp(store, key); const agent = request.agent(app);
    const registered = await agent.post("/api/auth/register").send({ name: "Mongo Test Reader", email: "mongo@example.test", password: "Mongo-Password-123456" }).expect(201);
    assert.equal((await agent.get("/api/account")).body.user.id, registered.body.user.id);
    const input = { customer: { name: "Mongo Reader", phone: "01700000000", address: "Isolated test address, house 10", city: "Dhaka", zone: "dhaka" }, items: [{ productId: "b001", quantity: 20 }], paymentMethod: "cod" };
    const pair = await Promise.all([agent.post("/api/orders").send(input), agent.post("/api/orders").send(input)]);
    assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]); assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 0);
    const order = pair.find((r) => r.status === 201)!.body.order;
    await request(app).patch(`/api/admin/orders/${order.id}`).set("Authorization", `Bearer ${key}`).send({ status: "cancelled" }).expect(200);
    assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 20);
    assert.ok((await store.snapshot()).audit.some((a) => a.action === "order.cancelled"));
    await agent.get("/api/admin/orders").expect(401);
    await agent.post("/api/auth/logout").send({}).expect(200); await agent.get("/api/account").expect(401);
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
