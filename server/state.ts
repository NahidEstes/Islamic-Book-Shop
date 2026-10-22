import type { Collection, ShopData } from "../lib/commerce-types";
import { seedProducts } from "../lib/catalog";
export const initialCollections: Collection[] = [
  { id: "collection-beginners", slug: "new-readers", title: "নতুন পাঠকের জন্য", description: "সহজ পাঠ দিয়ে বইয়ের জগতে প্রথম পদক্ষেপ।", reason: "ছোট পরিসর, সহজ ভাষা ও বিষয়বৈচিত্র্যের কথা মাথায় রেখে সাজানো একটি নমুনা সংগ্রহ।", productIds: ["b001", "b006", "b007"], published: true, featured: true, sortOrder: 1 },
  { id: "collection-children", slug: "children-seerah", title: "শিশুদের সীরাত", description: "ছোট্ট পাঠকের সঙ্গে সুন্দর পাঠের সময়।", reason: "শিশু ও অভিভাবকের একসঙ্গে পড়ার উপযোগী নমুনা বই দিয়ে সাজানো।", productIds: ["b004", "b009"], published: true, featured: true, sortOrder: 2 },
  { id: "collection-family", slug: "family-library", title: "পরিবারের পাঠাগার", description: "পরিবারের সবাই মিলে পড়ার জন্য।", reason: "পরিবার, মূল্যবোধ ও দৈনন্দিন পাঠের অভ্যাসকে গুরুত্ব দেওয়া হয়েছে।", productIds: ["b001", "b008", "b010"], published: true, featured: true, sortOrder: 3 },
];
export function migrateState(raw: Partial<ShopData> = {}): ShopData {
  return {
    products: (raw.products || structuredClone(seedProducts)).map((p) => ({ ...p, sample: p.sample ?? true, tags: p.tags || [], galleryAssetIds: p.galleryAssetIds || [], previewAssetIds: p.previewAssetIds || [], previewPermission: p.previewPermission ?? false, lowStockThreshold: p.lowStockThreshold ?? 5, restockVersion: p.restockVersion || 0 })),
    orders: (raw.orders || []).map((o) => ({ ...o, preorderStatus: o.preorderStatus || "not-applicable" })),
    users: raw.users || [], sessions: raw.sessions || [], tokens: raw.tokens || [], reviews: raw.reviews || [], collections: raw.collections || structuredClone(initialCollections), assets: raw.assets || [], subscriptions: raw.subscriptions || [], notifications: raw.notifications || [], outbox: raw.outbox || [], returns: raw.returns || [], payments: raw.payments || [], refunds: raw.refunds || [], audit: raw.audit || [],
  };
}
