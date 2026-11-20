import assert from "node:assert/strict";
import { test } from "node:test";
import type { InventoryData, Purchase } from "../lib/commerce-types";
import { inventoryOverview, inventoryPeriodRange } from "../lib/inventory-overview";

function purchase(id: string, date: string, dueDate?: string, supplierId = id): Purchase {
  return { id, date, dueDate, supplierId, supplierName: supplierId, number: id, invoiceNo: "", totalMinor: 10000,
    subtotalMinor: 10000, discountMinor: 0, freightMinor: 0, note: "", receipts: [], requestId: id,
    createdAt: `${date}T12:00:00Z`, createdBy: "owner",
    lines: [{ productId: "book", title: "Book", quantity: 10, received: 0, unitCostMinor: 1000 }] };
}
const empty = (): InventoryData => ({ products: [], purchases: [], suppliers: [], payments: [], movements: [] });

test("inventory period presets handle year boundaries and leap February", () => {
  assert.deepEqual(inventoryPeriodRange("last-month", "2027-01-03"), { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(inventoryPeriodRange("last-month", "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(inventoryPeriodRange("month", "2026-11-19"), { from: "2026-11-01", to: "2026-11-19" });
  assert.deepEqual(inventoryPeriodRange("today", "2026-11-19"), { from: "2026-11-19", to: "2026-11-19" });
  assert.deepEqual(inventoryPeriodRange("all", "2026-11-19"), { from: "", to: "" });
});

test("period totals follow transaction dates while current dues and pending copies include older invoices", () => {
  const data = empty();
  data.purchases = [purchase("old", "2026-10-01", "2026-10-20"), purchase("start", "2026-11-01"), purchase("end", "2026-11-19"), purchase("future", "2026-11-20")];
  data.purchases[1].lines[0].received = 10;
  data.payments = [{ id: "payment", purchaseId: "old", amountMinor: 4000, date: "2026-11-15", reference: "test", method: "cash", note: "", requestId: "test", createdAt: "2026-11-15T00:00:00Z", createdBy: "owner" }];
  const report = inventoryOverview(data, inventoryPeriodRange("month", "2026-11-19"), "2026-11-19");
  assert.deepEqual(report.purchases.map((item) => item.id), ["end", "start"]);
  assert.equal(report.purchasedMinor, 20000);
  assert.equal(report.paidMinor, 4000);
  assert.equal(report.dueMinor, 36000);
  assert.deepEqual(report.pending.map((item) => item.id), ["old", "end", "future"]);
  assert.deepEqual(report.months, [{ month: "2026-11", purchasesMinor: 20000, paymentsMinor: 4000 }]);
  const lastMonth = inventoryOverview(data, inventoryPeriodRange("last-month", "2026-11-19"), "2026-11-19");
  assert.equal(lastMonth.paidMinor, 0);
  assert.equal(lastMonth.dueMinor, report.dueMinor);
});

test("dues group by supplier, prioritize oldest due dates, exclude settled invoices and support undated legacy invoices", () => {
  const data = empty();
  data.purchases = [purchase("undated", "2026-11-01"), purchase("soon", "2026-11-01", "2026-11-25"), purchase("late", "2026-10-01", "2026-11-01", "publisher"), purchase("today", "2026-10-01", "2026-11-19", "publisher"), purchase("settled", "2026-10-01", "2026-10-01")];
  data.payments = [{ id: "paid", purchaseId: "settled", amountMinor: 10000, date: "2026-10-01", reference: "paid", method: "cash", note: "", requestId: "paid", createdAt: "", createdBy: "owner" }];
  const report = inventoryOverview(data, { from: "", to: "" }, "2026-11-19");
  assert.deepEqual(report.supplierDues.map((group) => group.supplierId), ["publisher", "soon", "undated"]);
  assert.equal(report.supplierDues[0].totalMinor, 20000);
  assert.equal(report.supplierDues[0].overdueMinor, 10000);
  assert.deepEqual(report.supplierDues[0].invoices.map((item) => item.purchase.id), ["late", "today"]);
});

test("urgent stock puts zero stock first, excludes preorders, and movements use the store's local day", () => {
  const data = empty();
  data.products = [{ id: "low", title: "Low", stock: 2, lowStockThreshold: 5 }, { id: "out", title: "Out", stock: 0 }, { id: "healthy", title: "Healthy", stock: 10 }, { id: "preorder", title: "Preorder", stock: 0, preorder: { enabled: true, price: 100, limit: 10, reserved: 0, publicationDate: "2027-01-01", dispatchDate: "2027-01-05", cancellationTerms: "Terms" } }];
  data.movements = ["2026-11-18T21:00:00Z", "2026-11-19T20:59:59Z", "2026-11-19T21:00:00Z"].map((at) => ({ id: at, at, actorName: "Owner", productId: "low", title: "Low", action: "stock.adjusted", change: { before: 1, after: 2 } }));
  const report = inventoryOverview(data, inventoryPeriodRange("today", "2026-11-19"), "2026-11-19");
  assert.deepEqual(report.urgent.map((book) => book.id), ["out", "low"]);
  assert.deepEqual(report.movements.map((entry) => entry.at), ["2026-11-19T20:59:59Z", "2026-11-18T21:00:00Z"]);
});
