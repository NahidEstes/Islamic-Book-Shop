import { seedProducts, deliveryFee } from "./catalog";
import { initialCollections } from "../server/state";
import { salePrice } from "./availability";

export const demoUnavailable = "এই ডেমোতে তথ্য সংরক্ষণ বন্ধ। বই বা অর্ডার স্থায়ীভাবে সংরক্ষণ করতে অনলাইন API ও ডেটাবেস সংযুক্ত করুন।";
export function demoResponse(request: Request, path: string[]) {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Noor-Mode": "read-only-demo" } });
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: demoUnavailable, readOnly: true }, 503);
  const url = new URL(request.url), route = path.join("/");
  const products = seedProducts.map((p) => ({ ...p, sample: true, tags: [], galleryAssetIds: [], previewAssetIds: [], previewPermission: false, rating: { average: 0, count: 0 } }));
  if (route === "health") return json({ ok: true, demo: true, database: "none", storage: "read-only-demo" });
  if (route === "config") return json({ demo: true, readOnly: true, browserCatalog: true, emailAvailable: false, paymentMethods: [], delivery: { dhaka: deliveryFee("dhaka"), outside: deliveryFee("outside") } });
  if (route === "auth/me") return json({ user: null });
  if (route === "products") {
    const query = (url.searchParams.get("q") || "").trim().toLowerCase(), category = url.searchParams.get("category") || "all";
    const visible = products.filter((p) => (category === "all" || p.category === category) && (!query || `${p.title} ${p.author} ${p.publisher}`.toLowerCase().includes(query)));
    const sort = url.searchParams.get("sort");
    if (sort === "price-asc") visible.sort((a, b) => salePrice(a) - salePrice(b));
    if (sort === "price-desc") visible.sort((a, b) => salePrice(b) - salePrice(a));
    return json({ products: visible });
  }
  if (path.length === 2 && path[0] === "products") { const product = products.find((p) => p.slug === path[1]); return product ? json({ product }) : json({ error: "বইটি পাওয়া যায়নি" }, 404); }
  if (route === "collections") return json({ collections: initialCollections.filter((c) => c.published).sort((a, b) => a.sortOrder - b.sortOrder) });
  if (path.length === 2 && path[0] === "collections") { const collection = initialCollections.find((c) => c.published && c.slug === path[1]); return collection ? json({ collection }) : json({ error: "সংগ্রহ পাওয়া যায়নি" }, 404); }
  if (path.length === 3 && path[0] === "books" && ["preview", "reviews"].includes(path[2])) {
    if (!products.some((p) => p.id === path[1])) return json({ error: "বইটি পাওয়া যায়নি" }, 404);
    return path[2] === "preview" ? json({ assets: [] }) : json({ reviews: [], ownReview: null, eligible: false });
  }
  if (["admin", "account", "auth", "orders"].includes(path[0])) return json({ error: demoUnavailable, readOnly: true }, 503);
  return json({ error: "তথ্য পাওয়া যায়নি।" }, 404);
}
