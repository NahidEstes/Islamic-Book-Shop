import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
import { FileStore, connectStore } from "../server/store";
import { seedProducts } from "../lib/catalog";
import { normalizePhone } from "../lib/validation";

const adminKey = "test-only-private-key-at-least-24-characters";
const customer = { name: "পরীক্ষামূলক পাঠক", phone: "01700000000", address: "ডেমো বাসা ১০, ডেমো রোড ৫", city: "ঢাকা", zone: "dhaka" };
const input = (quantity = 1) => ({ customer, items: [{ productId: "b001", quantity }], paymentMethod: "cod" });
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve("work");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, "test-store-"));
  assert.ok(path.resolve(dir).startsWith(base + path.sep));
  t.after(async () => { assert.ok(path.resolve(dir).startsWith(base + path.sep)); await rm(dir, { recursive: true, force: true }); });
  const filename = path.join(dir, "store.json");
  const store = new FileStore(filename);
  return { store, filename, app: createApp(store, adminKey) };
}
test("catalog filtering and sorting use product metadata", async (t) => {
  const { app } = await setup(t);
  const response = await request(app).get("/api/products?category=life&sort=price-asc").expect(200);
  assert.ok(response.body.products.length >= 2);
  assert.ok(response.body.products.every((p: { category: string }) => p.category === "life"));
  const prices = response.body.products.map((p: { price: number }) => p.price);
  assert.deepEqual(prices, [...prices].sort((a: number, b: number) => a - b));
  const search = await request(app).get(`/api/products?q=${encodeURIComponent("দোয়া")}`).expect(200);
  assert.equal(search.body.products[0].id, "b005");
  await request(app).get("/api/products/nonexistent").expect(404);
});
test("checkout calculates prices on the server, saves order, and decrements inventory", async (t) => {
  const { app, store, filename } = await setup(t);
  const response = await request(app).post("/api/orders").send({ ...input(2), total: 1, delivery: 0, items: [{ productId: "b001", quantity: 2, price: 1 }] }).expect(201);
  assert.equal(response.body.order.subtotal, 900);
  assert.equal(response.body.order.delivery, 60);
  assert.equal(response.body.order.total, 960);
  assert.equal(response.body.order.demo, true);
  assert.equal(response.body.order.paymentStatus, "unpaid");
  assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 18);
  const restored = new FileStore(filename);
  assert.equal((await restored.orders())[0].id, response.body.order.id);
  await request(app).post("/api/orders/lookup").send({ orderId: response.body.order.id, phone: "01700000001" }).expect(404);
  const lookup = await request(app).post("/api/orders/lookup").send({ orderId: response.body.order.id.toLowerCase(), phone: "+8801700000000" }).expect(200);
  assert.equal(lookup.body.order.id, response.body.order.id);
});
test("checkout rejects invalid phones, non-COD payments, duplicate products and missing items", async (t) => {
  const { app } = await setup(t);
  await request(app).post("/api/orders").send({ ...input(), customer: { ...customer, phone: "123" } }).expect(400);
  await request(app).post("/api/orders").send({ ...input(), paymentMethod: "card" }).expect(400);
  await request(app).post("/api/orders").send({ ...input(), items: [...input().items, ...input().items] }).expect(400);
  await request(app).post("/api/orders").send({ ...input(), items: [] }).expect(400);
  await request(app).post("/api/orders").send({ ...input(), items: [{ productId: "missing", quantity: 1 }] }).expect(404);
  await request(app).post("/api/orders").send(input(21)).expect(400);
});
test("concurrent orders cannot oversell the final copies", async (t) => {
  const { app, store } = await setup(t);
  const responses = await Promise.all([request(app).post("/api/orders").send(input(20)), request(app).post("/api/orders").send(input(20))]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 0);
  assert.equal((await store.orders()).length, 1);
});
test("admin authentication protects orders and cancellation restocks only once", async (t) => {
  const { app, store } = await setup(t);
  await request(app).get("/api/admin/orders").expect(401);
  await request(app).get("/api/admin/orders").set("Authorization", "Bearer invalid").expect(401);
  const { body } = await request(app).post("/api/orders").send(input(3)).expect(201);
  await request(app).get("/api/admin/orders").set("Authorization", `Bearer ${adminKey}`).expect(200);
  await request(app).patch(`/api/admin/orders/${body.order.id}`).set("Authorization", `Bearer ${adminKey}`).send({ status: "delivered" }).expect(409);
  await request(app).patch(`/api/admin/orders/${body.order.id}`).set("Authorization", `Bearer ${adminKey}`).send({ status: "cancelled" }).expect(200);
  assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 20);
  await request(app).patch(`/api/admin/orders/${body.order.id}`).set("Authorization", `Bearer ${adminKey}`).send({ status: "cancelled" }).expect(409);
  assert.equal((await store.products()).find((p) => p.id === "b001")!.stock, 20);
});
test("admin product updates validate prices, stock and unique slugs", async (t) => {
  const { app } = await setup(t);
  const put = (data: object) => request(app).put("/api/admin/products/b001").set("Authorization", `Bearer ${adminKey}`).send(data);
  await put({ ...seedProducts[0], price: -10 }).expect(400);
  await put({ ...seedProducts[0], stock: -1 }).expect(400);
  await put({ ...seedProducts[0], price: 1000 }).expect(400);
  await put({ ...seedProducts[0], slug: seedProducts[1].slug }).expect(409);
  const response = await put({ ...seedProducts[0], stock: 7, price: 420 }).expect(200);
  assert.equal(response.body.product.stock, 7);
  assert.equal(response.body.product.price, 420);
});
test("delivery is selected on server and Bengali phone digits normalize", async (t) => {
  const { app } = await setup(t);
  assert.equal(normalizePhone("+৮৮০১৭০০০০০০০০"), "01700000000");
  const response = await request(app).post("/api/orders").send({ ...input(), customer: { ...customer, phone: "০১৭০০০০০০০০", zone: "outside" } }).expect(201);
  assert.equal(response.body.order.delivery, 120);
  assert.equal(response.body.order.customer.phone, "01700000000");
});
test("live mode refuses local demo storage", async () => {
  await assert.rejects(connectStore(undefined, false), /MongoDB is required/);
  await assert.rejects(connectStore(undefined, true, true), /MongoDB is required/);
});
