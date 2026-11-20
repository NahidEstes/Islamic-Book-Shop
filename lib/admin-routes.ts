import type { Permission } from "./commerce-types";

export const adminSections = [
  { slug: "dashboard", permission: "reports", label: "বিক্রির হিসাব" },
  { slug: "reports", permission: "reports", label: "লাভ ও ব্যবসার রিপোর্ট" },
  { slug: "coupons", permission: "promotions", label: "কুপন ও অফার" },
  { slug: "books", permission: "catalog", label: "বই ও প্রিভিউ" },
  { slug: "inventory", permission: "inventory", label: "স্টক ও ক্রয়" },
  { slug: "orders", permission: "orders", label: "অর্ডার ও প্রি-অর্ডার" },
  { slug: "collections", permission: "collections", label: "নির্বাচিত সংগ্রহ" },
  { slug: "reviews", permission: "reviews", label: "রিভিউ" },
  { slug: "returns", permission: "returns", label: "রিটার্ন" },
  { slug: "finance", permission: "finance", label: "পেমেন্ট ও রিফান্ড" },
  { slug: "staff", permission: "staff", label: "কর্মী ও অনুমতি" },
  { slug: "audit", permission: "audit", label: "পরিবর্তনের লগ" },
  { slug: "email-queue", permission: "notifications", label: "ইমেইল কিউ" },
] as const satisfies ReadonlyArray<{ slug: string; permission: Permission; label: string }>;

export type AdminSection = typeof adminSections[number];
export const adminHref = (slug: AdminSection["slug"]) => `/admin/${slug}` as const;
export const booksHref = adminHref("books");
export const inventoryHref = adminHref("inventory");
export const newPurchaseHref = `${inventoryHref}/purchases/new`;
export const purchaseHref = (id: string) => `${inventoryHref}/purchases/${encodeURIComponent(id)}`;
export const purchaseActionHref = (id: string, action: "receive" | "pay") => `${purchaseHref(id)}?action=${action}`;
export const stockTabs = ["all", "low-stock", "out-of-stock"] as const;
export type StockTab = (typeof stockTabs)[number];
export const stockTabHref = (tab: StockTab) => tab === "all" ? booksHref : `${booksHref}?tab=${tab}`;
export const lowStockBooksHref = stockTabHref("low-stock");
export const newBookHref = `${booksHref}/new` as const;
export const isBookId = (id: string) => id.length >= 1 && id.length <= 60 && !/[^a-zA-Z0-9_-]/.test(id);
export const editBookHref = (id: string) => `${booksHref}/${encodeURIComponent(id)}/edit` as const;

export function adminSectionForPath(path: string): AdminSection | undefined {
  const parts = path.split("/");
  const isEditor = parts.length === 5 && parts[0] === "" && parts[1] === "admin" && parts[2] === "books" && parts[4] === "edit" && isBookId(parts[3]);
  if (path === newBookHref || path === `${booksHref}/import` || isEditor) return adminSections.find((section) => section.slug === "books");
  const inventoryPage = [inventoryHref, `${inventoryHref}/purchases`, newPurchaseHref, `${inventoryHref}/suppliers`, `${inventoryHref}/movements`].includes(path);
  const purchasePage = parts.length === 5 && parts[0] === "" && parts[1] === "admin" && parts[2] === "inventory" && parts[3] === "purchases" && isBookId(parts[4]);
  if (inventoryPage || purchasePage) return adminSections.find((section) => section.slug === "inventory");
  return adminSections.find((section) => adminHref(section.slug) === path);
}

export function adminReturnTo(value: string | null): string | null {
  if (value === `${booksHref}?new=1`) return newBookHref;
  if (stockTabs.some((tab) => value === `${booksHref}?tab=${tab}`)) return value;
  if (value) {
    const [path, query] = value.split("?");
    if ((query === "action=receive" || query === "action=pay") && value === `${path}?${query}`
      && path.startsWith(`${inventoryHref}/purchases/`) && adminSectionForPath(path)?.permission === "inventory") return value;
  }
  if (value === "/admin" || (value && adminSectionForPath(value))) return value;
  return null;
}
