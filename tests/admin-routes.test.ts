import assert from "node:assert/strict";
import { test } from "node:test";
import { adminHref, adminReturnTo, adminSectionForPath, adminSections, editBookHref, inventoryHref, lowStockBooksHref, newBookHref, newPurchaseHref, purchaseActionHref, purchaseHref, stockTabHref } from "../lib/admin-routes";
import { rolePermissions } from "../lib/commerce-types";

test("owner routes cover every admin permission with a unique bookmarkable path", () => {
  const paths = adminSections.map((section) => adminHref(section.slug));
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual([...new Set(adminSections.map((section) => section.permission))].sort(), [...rolePermissions.owner].sort());
  for (const path of paths) assert.equal(adminReturnTo(path), path);
});

test("after sign-in only known admin paths are valid return destinations", () => {
  assert.equal(adminReturnTo("/admin"), "/admin");
  assert.equal(adminReturnTo(newBookHref), newBookHref);
  for (const destination of [null, "//example.com/admin", "https://example.com", "/admin/../account", "/admin/not-a-section", "/admin/collections?next=//example.com", "/admin/books#other"]) {
    assert.equal(adminReturnTo(destination), null);
  }
});

test("book editor deep links require the catalog role and preserve safe return paths", () => {
  const edit = editBookHref("book_abc-123");
  for (const path of [newBookHref, edit]) {
    assert.equal(adminSectionForPath(path)?.permission, "catalog");
    assert.equal(adminReturnTo(path), path);
  }
  assert.equal(adminReturnTo("/admin/books?new=1"), newBookHref);
  for (const path of ["/admin/books/../edit", "/admin/books/a%2Fb/edit", "/admin/books/b001/edit?next=//example.com", "/admin/books//edit", "/admin/books/b001/edit\n"]) {
    assert.equal(adminSectionForPath(path), undefined);
    assert.equal(adminReturnTo(path), null);
  }
});

test("stock tab bookmarks are preserved after sign-in and reject unrecognized parameters", () => {
  assert.equal(lowStockBooksHref, "/admin/books?tab=low-stock");
  for (const tab of ["all", "low-stock", "out-of-stock"] as const) assert.equal(adminReturnTo(stockTabHref(tab)), stockTabHref(tab));
  for (const destination of ["/admin/books?tab=low-stock&next=//example.com", "/admin/books?tab=other", "/admin/books?tab=low-stock#other"]) {
    assert.equal(adminReturnTo(destination), null);
  }
});

test("inventory routes require inventory access and preserve safe bookmarks", () => {
  for (const path of [inventoryHref, newPurchaseHref, `${inventoryHref}/purchases`, purchaseHref("purchase-test"), `${inventoryHref}/suppliers`, `${inventoryHref}/movements`]) {
    assert.equal(adminSectionForPath(path)?.permission, "inventory");
    assert.equal(adminReturnTo(path), path);
  }
  assert.ok(!rolePermissions.catalog.includes("inventory"));
  assert.ok(rolePermissions.manager.includes("inventory"));
  for (const action of ["receive", "pay"] as const) assert.equal(adminReturnTo(purchaseActionHref("purchase-test", action)), purchaseActionHref("purchase-test", action));
  for (const query of ["action=delete", "action=pay&next=//example.com", "action=pay?action=receive", "action=receive#other"]) assert.equal(adminReturnTo(`${purchaseHref("purchase-test")}?${query}`), null);
  for (const path of ["/admin/inventory/../account", "/admin/inventory/purchases/a%2Fb", "/admin/inventory/purchases/test?next=//example.com"]) assert.equal(adminReturnTo(path), null);
});
