import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentDemoEnabled } from "../lib/runtime-mode";
import { demoResponse } from "../lib/deployment-demo";
import config from "../next.config";

test("database-free demo is explicit or a safe Vercel fallback, and never silently replaces live/configured data", () => {
  assert.equal(deploymentDemoEnabled({}), false);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1" }), true);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1", API_INTERNAL_URL: "http://127.0.0.1:4000" }), true);
  assert.equal(deploymentDemoEnabled({ VERCEL_DEMO_MODE: "true" }), true);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1", MONGODB_URI: "configured-private-value" }), false);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1", API_INTERNAL_URL: "https://api.example.test" }), false);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1", API_INTERNAL_URL: "invalid" }), false);
  assert.equal(deploymentDemoEnabled({ VERCEL: "1", VERCEL_DEMO_MODE: "false" }), false);
  assert.equal(deploymentDemoEnabled({ VERCEL_DEMO_MODE: "true", DEMO_MODE: "false" }), false);
});

test("embedded demo supplies catalog/config/collections without auth or storage and never offers order saving", async () => {
  const get = async (route: string) => demoResponse(new Request(`https://shop.example.test/api/${route}`), route.split("?")[0].split("/"));
  const config = await (await get("config")).json(); assert.equal(config.demo, true); assert.equal(config.readOnly, true); assert.deepEqual(config.paymentMethods, []);
  const catalog = await (await get("products")).json(); assert.equal(catalog.products.length, 10);
  assert.ok(catalog.products.every((p: { sample: boolean; stockCost?: unknown; previewAssetIds: string[] }) => p.sample && !p.stockCost && p.previewAssetIds.length === 0));
  const sorted = await (await get("products?sort=price-asc&category=life")).json();
  assert.ok(sorted.products.every((p: { category: string }) => p.category === "life"));
  assert.ok(sorted.products[0].price <= sorted.products.at(-1).price);
  const product = catalog.products[0]; assert.equal((await (await get(`products/${product.slug}`)).json()).product.id, product.id);
  assert.equal((await get("products/missing")).status, 404);
  assert.equal((await (await get("collections")).json()).collections.length, 3);
  assert.deepEqual(await (await get("auth/me")).json(), { user: null });
  assert.deepEqual(await (await get(`books/${product.id}/reviews`)).json(), { reviews: [], ownReview: null, eligible: false });
  assert.deepEqual(await (await get(`books/${product.id}/preview`)).json(), { assets: [] });
  const health = await get("health"); assert.equal(health.headers.get("Cache-Control"), "no-store"); assert.equal((await health.json()).database, "none");
});

test("all embedded demo mutations fail honestly without collecting credentials or fabricating saved records", async () => {
  for (const [method, route] of [["POST", "orders"], ["POST", "auth/register"], ["POST", "admin/products"], ["PUT", "admin/products/b001"], ["DELETE", "admin/products/b001"]]) {
    const response = demoResponse(new Request(`https://shop.example.test/api/${route}`, { method, body: "private input" }), route.split("/"));
    assert.equal(response.status, 503); const result = await response.json(); assert.equal(result.readOnly, true); assert.equal(result.order, undefined); assert.equal(result.user, undefined);
  }
});

test("normal local API rewrite runs before the filesystem demo handler", async () => {
  // Tests run without deployment flags: local API stays on its existing Express port.
  if (!deploymentDemoEnabled(process.env)) {
    const rules = await config.rewrites!(); assert.ok(!Array.isArray(rules));
    if (!Array.isArray(rules)) assert.equal(rules.beforeFiles?.[0].source, "/api/:path*");
  }
});
