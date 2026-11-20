import { test } from "node:test";
import assert from "node:assert/strict";
import { isLowStock, isOutOfStock } from "../lib/availability";
import { seedProducts } from "../lib/catalog";

test("low stock includes the threshold and zero, respects legacy defaults, and excludes active preorders", () => {
  const book = { ...seedProducts[0], stock: 5, lowStockThreshold: undefined };
  assert.equal(isLowStock(book), true);
  assert.equal(isLowStock({ ...book, stock: 6 }), false);
  assert.equal(isOutOfStock(book), false);
  assert.equal(isLowStock({ ...book, stock: 0, lowStockThreshold: 0 }), true);
  assert.equal(isOutOfStock({ ...book, stock: 0 }), true);
  assert.equal(isLowStock({ ...book, stock: 2, lowStockThreshold: 1 }), false);
  const preorder = { enabled: true, price: 100, limit: 10, reserved: 10, publicationDate: "2027-01-01", dispatchDate: "2027-01-05", cancellationTerms: "Example cancellation terms" };
  assert.equal(isLowStock({ ...book, stock: 0, preorder }), false);
  assert.equal(isOutOfStock({ ...book, stock: 0, preorder }), false);
  assert.equal(isOutOfStock({ ...book, stock: 0, preorder: { ...preorder, enabled: false } }), true);
});
