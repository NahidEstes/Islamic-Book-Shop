import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../server/app";
import { FileStore, reserveOrder } from "../server/store";
import { makeCsv, parseCsv } from "../lib/csv";
import { businessReport } from "../lib/business-report";
import { takeStockCost, restoreStockCost } from "../lib/stock-cost";
import { allocateFloor, allocateRound } from "../lib/money";
import type { OrderInput } from "../lib/types";
const key = "business-tests-owner-key-over-24-chars";
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka" }).format(new Date());
const input: OrderInput = { customer: { name: "Test Reader", phone: "01700000000", address: "Isolated test address 123", city: "Dhaka", zone: "dhaka" }, items: [{ productId: "b001", quantity: 1 }], paymentMethod: "cod" };
async function setup(t: { after: (f: () => Promise<void>) => void }) {
  const base = path.resolve("work"); await mkdir(base, { recursive: true }); const dir = await mkdtemp(path.join(base, "business-test-"));
  t.after(async () => { assert.ok(path.resolve(dir).startsWith(base + path.sep)); await rm(dir, { recursive: true, force: true }); });
  const store = new FileStore(path.join(dir, "store.json")); const app = createApp(store, key, { uploadDir: path.join(dir, "uploads"), mailer: { available: false, async send() {} } });
  const owner = (method: "get" | "post" | "put", url: string) => request(app)[method]("/api/admin" + url).set("Authorization", "Bearer " + key);
  const coupon = async (changes = {}) => (await owner("post", "/coupons").send({ code: "READ10", type: "percent", value: 10, minimumMinor: 0, starts: today, ends: "2099-12-31", limit: 100, active: true, productIds: [], ...changes }).expect(201)).body.coupon;
  return { store, app, owner, coupon };
}

test("coupon quote is read-only; percentage caps and selected books are enforced by checkout", async (t) => {
  const { store, app, coupon } = await setup(t);
  await coupon({ productIds: ["b002"], maximumMinor: 2000 });
  const items = [{ productId: "b001", quantity: 1 }, { productId: "b002", quantity: 1 }];
  const quote = await request(app).post("/api/orders/quote").send({ items, zone: "dhaka", couponCode: "read10" }).expect(200);
  assert.equal(quote.body.discountMinor, 2000); assert.equal(quote.body.total, 870);
  assert.equal((await store.snapshot()).orders.length, 0); assert.equal((await store.products())[0].stock, 20);
  const order = (await request(app).post("/api/orders").send({ ...input, items, couponCode: "READ10", total: 1, discount: 1000000 }).expect(201)).body.order;
  assert.equal(order.total, 870); assert.equal(order.items[1].discountMinor, 2000); assert.equal(order.items[0].discountMinor, undefined);
  assert.equal(order.items[0].cost, undefined);
  await request(app).post("/api/orders").send({ ...input, couponCode: "READ10" }).expect(400);
});

test("last coupon use is atomic and cancellation releases the quota", async (t) => {
  const { app, store, coupon } = await setup(t); await coupon({ limit: 1 });
  const pair = await Promise.all([request(app).post("/api/orders").send({ ...input, couponCode: "READ10" }), request(app).post("/api/orders").send({ ...input, couponCode: "READ10" })]);
  assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]);
  const order = pair.find((r) => r.status === 201)!.body.order;
  await store.updateStatus(order.id, "cancelled");
  await request(app).post("/api/orders").send({ ...input, couponCode: "READ10" }).expect(201);
});

test("coupon dates, minimum, duplicate codes, revisions and roles are validated", async (t) => {
  const { owner, app, coupon } = await setup(t);
  const created = await coupon({ minimumMinor: 100000 });
  await request(app).post("/api/orders/quote").send({ items: input.items, zone: "dhaka", couponCode: "READ10" }).expect(400);
  await owner("post", "/coupons").send(created).expect(409);
  await owner("put", `/coupons/${created.id}`).send({ ...created, active: false, expectedVersion: 1 }).expect(200);
  await owner("put", `/coupons/${created.id}`).send({ ...created, expectedVersion: 1 }).expect(409);
  await request(app).get("/api/admin/coupons").expect(401);
  await coupon({ code: "EXPIRED", starts: "2000-01-01", ends: "2000-02-01" });
  await request(app).post("/api/orders").send({ ...input, couponCode: "EXPIRED" }).expect(409);
  await owner("post", "/coupons").send({ ...created, code: "INVALID", value: 101 }).expect(400);
});

test("inventory receipt cost includes freight/discount and sale snapshots survive repricing", async (t) => {
  const { store, owner, app } = await setup(t);
  await store.transaction((d) => { d.products[0].stock = 0; });
  const supplier = (await owner("post", "/inventory/suppliers").send({ name: "Cost Supplier" }).expect(201)).body.supplier;
  const purchase = (await owner("post", "/inventory/purchases").send({ supplierId: supplier.id, date: today, discount: 5, freight: 15, lines: [{ productId: "b001", quantity: 3, unitCost: 100 }], requestId: randomUUID() }).expect(201)).body.purchase;
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send({ items: [{ productId: "b001", quantity: 1 }], requestId: randomUUID() }).expect(200);
  await owner("post", `/inventory/purchases/${purchase.id}/receive`).send({ items: [{ productId: "b001", quantity: 2 }], requestId: randomUUID() }).expect(200);
  assert.deepEqual((await store.products())[0].stockCost, { quantity: 3, valueMinor: 31000 });
  const order = await store.transaction((d) => reserveOrder(d, input, false));
  assert.deepEqual(order.items[0].cost, { knownMinor: 10333, unknownQuantity: 0 });
  await store.transaction((d) => { d.orders[0].status = "delivered"; d.orders[0].deliveredAt = new Date().toISOString(); d.products[0].price = 500; });
  const report = (await owner("get", "/reports").expect(200)).body;
  assert.equal(report.revenueMinor, 45000); assert.equal(report.grossProfitMinor, 34667);
  assert.equal(report.inventoryValueMinor, 20667);
  const catalog = (await request(app).get("/api/products")).body;
  assert.equal(catalog.products[0].stockCost, undefined);
  const lookup = (await request(app).post("/api/orders/lookup").send({ orderId: order.id, phone: input.customer.phone }).expect(200)).body;
  assert.equal(lookup.order.items[0].cost, undefined);
});

test("unknown opening stock is never priced retroactively; opening values reject stale stock", async (t) => {
  const { store, owner } = await setup(t);
  await store.transaction((d) => { const order = reserveOrder(d, input, false); order.status = "delivered"; });
  assert.equal((await owner("get", "/reports")).body.resultMinor, null);
  const body = { unitCostMinor: 10000, expectedStock: 19, expectedKnown: 0, requestId: randomUUID() };
  await owner("put", "/inventory/products/b001/opening-cost").send({ ...body, expectedStock: 20 }).expect(409);
  await owner("put", "/inventory/products/b001/opening-cost").send(body).expect(200);
  await owner("put", "/inventory/products/b001/opening-cost").send(body).expect(200);
  assert.equal((await owner("get", "/reports")).body.resultMinor, null);
  assert.deepEqual((await store.products())[0].stockCost, { quantity: 19, valueMinor: 190000 });
});

test("discounted decimal collections and refunds cannot exceed net item value; returned costs restore once", async (t) => {
  const { store, owner, app, coupon } = await setup(t); await coupon({ value: 11 });
  await store.transaction((d) => { d.products[0].price = 451; d.products[0].stockCost = { quantity: 20, valueMinor: 200000 }; });
  const registration = await request(app).post("/api/auth/register").send({ name: "Test Reader", email: "return-cost@example.test", password: "Example-Password-123456" }).expect(201);
  const order = await store.transaction((d) => reserveOrder(d, { ...input, couponCode: "READ10" }, false, registration.body.user.id));
  await store.transaction((d) => { d.orders[0].status = "delivered"; });
  assert.equal(order.total, 461.39);
  await owner("post", "/payments").send({ orderId: order.id, amount: order.total, reference: "CENTS-PAID", method: "cod", confirmedManual: true }).expect(201);
  await store.transaction((d) => { d.returns.push({ id: "return-cost", orderId: order.id, userId: registration.body.user.id, reason: "Test returning a book", items: input.items, status: "approved", restocked: false, note: "", createdAt: new Date().toISOString() }); });
  await request(app).patch("/api/admin/returns/return-cost").set("Authorization", "Bearer " + key).send({ status: "received", restock: true, note: "" }).expect(200);
  assert.deepEqual((await store.products())[0].stockCost, { quantity: 20, valueMinor: 200000 });
  await owner("post", "/refunds").send({ returnId: "return-cost", amount: 401.40, method: "cash" }).expect(409);
  await owner("post", "/refunds").send({ returnId: "return-cost", amount: 401.39, method: "cash" }).expect(201);
  const report = businessReport(await store.snapshot()); assert.equal(report.revenueMinor, 0); assert.equal(report.costMinor, 0);
});

test("expense recording is idempotent, date-filtered, auditable and voidable", async (t) => {
  const { owner, store } = await setup(t);
  const body = { date: today, category: "packaging", amountMinor: 2500, note: "Packaging materials", reference: "EXP-001", requestId: randomUUID() };
  const expense = (await owner("post", "/reports/expenses").send(body).expect(201)).body.expense;
  await owner("post", "/reports/expenses").send(body).expect(201);
  await owner("post", "/reports/expenses").send({ ...body, note: "Changed" }).expect(409);
  assert.equal((await owner("get", `/reports?from=${today}&to=${today}`)).body.expensesMinor, 2500);
  assert.equal((await owner("get", "/reports?from=2000-01-01&to=2000-01-31")).body.expensesMinor, 0);
  await owner("post", `/reports/expenses/${expense.id}/void`).expect(200);
  assert.equal((await owner("get", "/reports")).body.expensesMinor, 0);
  assert.equal((await store.snapshot()).expenses.length, 1);
});

test("CSV parsing supports BOM, quoted newlines and commas and neutralizes spreadsheet formulas", () => {
  const text = makeCsv([["title", "description"], ["A, B", 'Two\nlines "quoted"'], ["=HYPERLINK(1)", "safe"]]);
  const rows = parseCsv(text); assert.deepEqual(rows[1], ["A, B", 'Two\nlines "quoted"']); assert.equal(rows[2][0], "'=HYPERLINK(1)");
  assert.throws(() => parseCsv('title\n"not closed')); assert.throws(() => parseCsv('title\n"closed"bad'));
  assert.deepEqual(parseCsv(makeCsv([[-25, "-25"]]))[0], ["-25", "'-25"]);
});

test("CSV preview makes no writes, invalid batches are atomic and valid imports are retry-safe", async (t) => {
  const { owner, store } = await setup(t);
  const headers = ["slug", "title", "author", "publisher", "category", "price", "originalPrice", "description"];
  const row = ["new-test-book", "Test Import Book", "Test Author", "Test Publisher", "life", 200, 250, "Description for imported book"];
  const csv = makeCsv([headers, row]);
  const preview = (await owner("post", "/catalog/import/preview").send({ csv }).expect(200)).body;
  assert.equal(preview.valid, true); assert.equal((await store.products()).length, 10);
  const badCsv = makeCsv([headers, row, ["bad", "Bad Book", "Author", "Publisher", "invalid", 10, 5, "Invalid price book"]]);
  const invalid = (await owner("post", "/catalog/import/preview").send({ csv: badCsv }).expect(200)).body;
  assert.equal(invalid.valid, false);
  await owner("post", "/catalog/import/commit").send({ csv: badCsv, fingerprint: invalid.fingerprint, requestId: randomUUID() }).expect(400);
  assert.equal((await store.products()).length, 10);
  const body = { csv, fingerprint: preview.fingerprint, requestId: randomUUID() };
  await owner("post", "/catalog/import/commit").send(body).expect(200);
  await owner("post", "/catalog/import/commit").send(body).expect(200);
  assert.equal((await store.products()).length, 11);
  await owner("post", "/catalog/import/commit").send({ ...body, requestId: randomUUID() }).expect(409);
  await owner("post", "/catalog/import/preview").send({ csv: 'title\n"bad' }).expect(400);
});

test("CSV partial updates preserve omitted metadata and private cost pools; concurrent catalog edits invalidate preview", async (t) => {
  const { owner, store, app } = await setup(t);
  await store.transaction((d) => { d.products[0].subtitle = "Keep subtitle"; d.products[0].stockCost = { quantity: 20, valueMinor: 100000 }; });
  const csv = makeCsv([["id", "price"], ["b001", 400]]);
  const preview = (await owner("post", "/catalog/import/preview").send({ csv }).expect(200)).body;
  await owner("post", "/catalog/import/commit").send({ csv, fingerprint: preview.fingerprint, requestId: randomUUID() }).expect(200);
  const book = (await store.products())[0]; assert.equal(book.subtitle, "Keep subtitle"); assert.equal(book.price, 400); assert.equal(book.stockCost?.valueMinor, 100000);
  const stale = (await owner("post", "/catalog/import/preview").send({ csv }).expect(200)).body;
  await store.transaction((d) => { d.products[0].stock--; });
  await owner("post", "/catalog/import/commit").send({ csv, fingerprint: stale.fingerprint, requestId: randomUUID() }).expect(409);
  await request(app).post("/api/admin/catalog/import/preview").send({ csv }).expect(401);
  const exported = (await owner("get", "/catalog/export").expect(200)).body.csv;
  assert.ok(!exported.includes("stockCost"));
});

test("cost allocation conserves minor units when selling and restoring fractional average costs", async () => {
  const product = { id: "book", stockCost: { quantity: 3, valueMinor: 100 } } as Parameters<typeof takeStockCost>[0];
  const a = takeStockCost(product, 1), b = takeStockCost(product, 2);
  assert.equal(a.knownMinor + b.knownMinor, 100); assert.equal(product.stockCost?.valueMinor, 0);
  restoreStockCost(product, 1, a.knownMinor); assert.equal(product.stockCost?.valueMinor, a.knownMinor);
});

test("catalog editors cannot access business data or promotions and order operators cannot view saved costs", async (t) => {
  const { owner, app, store } = await setup(t);
  const agent = request.agent(app), password = "Example-Password-123456";
  const user = (await agent.post("/api/auth/register").send({ name: "Test Staff", email: "restricted@example.test", password }).expect(201)).body.user;
  await request(app).patch(`/api/admin/staff/${user.id}`).set("Authorization", "Bearer " + key).send({ role: "catalog", disabled: false }).expect(200);
  await agent.post("/api/auth/login").send({ email: user.email, password }).expect(200);
  for (const path of ["/reports", "/coupons"]) await agent.get("/api/admin" + path).expect(403);
  await agent.post("/api/admin/reports/expenses").send({}).expect(403);
  await agent.put("/api/admin/inventory/products/b001/opening-cost").send({}).expect(403);
  await store.transaction((d) => { d.products[0].stockCost = { quantity: 20, valueMinor: 100000 }; reserveOrder(d, input, false); });
  assert.equal((await agent.get("/api/admin/catalog").expect(200)).body.products[0].stockCost, undefined);
  assert.equal((await agent.get("/api/admin/products/b001").expect(200)).body.product.stockCost, undefined);
  await request(app).patch(`/api/admin/staff/${user.id}`).set("Authorization", "Bearer " + key).send({ role: "orders", disabled: false }).expect(200);
  await agent.post("/api/auth/login").send({ email: user.email, password }).expect(200);
  assert.equal((await agent.get("/api/admin/orders").expect(200)).body.orders[0].items[0].cost, undefined);
  await agent.get("/api/admin/catalog/export").expect(403);
  await owner("get", "/reports").expect(200);
});

test("received return credits reduce current customer dues even before collection", async (t) => {
  const { store } = await setup(t);
  await store.transaction((d) => {
    const order = reserveOrder(d, input, false); order.status = "delivered";
    d.returns.push({ id: "credit", orderId: order.id, userId: "test", reason: "Test return credit", items: input.items, status: "received", restocked: false, note: "", createdAt: new Date().toISOString(), accounting: { revenueMinor: 45000, costRecoveredMinor: 0, unknownQuantity: 0 } });
  });
  assert.equal(businessReport(await store.snapshot()).customerDuesMinor, 6000);
});

test("split returns preserve discounted minor units even with identical receipt timestamps", async (t) => {
  const { app, store, coupon } = await setup(t); await coupon({ type: "fixed", value: 1 });
  const order = await store.transaction((d) => {
    d.products[0].price = 1; d.products[0].stockCost = { quantity: 20, valueMinor: 2000 };
    const o = reserveOrder(d, { ...input, items: [{ productId: "b001", quantity: 3 }], couponCode: "READ10" }, false); o.status = "delivered"; o.deliveredAt = new Date().toISOString();
    for (const [id, quantity] of [["r1", 1], ["r2", 2]] as const) d.returns.push({ id, orderId: o.id, userId: "test", reason: "Split test return", items: [{ productId: "b001", quantity }], status: "approved", restocked: false, note: "", createdAt: new Date().toISOString() });
    return o;
  });
  for (const id of ["r1", "r2"]) await request(app).patch(`/api/admin/returns/${id}`).set("Authorization", "Bearer " + key).send({ status: "received", restock: true }).expect(200);
  await store.transaction((d) => { for (const r of d.returns) r.receivedAt = order.deliveredAt; });
  const report = businessReport(await store.snapshot()); assert.equal(report.revenueMinor, 0); assert.equal(report.costMinor, 0);
  assert.equal((await store.snapshot()).returns.reduce((n, r) => n + r.accounting!.revenueMinor, 0), 200);
});

test("large invoice allocations conserve exact integer poisha", () => {
  const total = 99999999999, whole = 999999;
  const a = allocateFloor(total, 333333, whole), b = allocateFloor(total, 666666, whole);
  assert.equal(a + (b - a) + (total - b), total);
  assert.equal(allocateRound(total, whole, whole), total);
});
