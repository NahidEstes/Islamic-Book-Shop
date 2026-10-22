import type { Product } from "./types";
export const isPreorder = (p: Product) => p.preorder?.enabled === true;
export const availableQuantity = (p: Product) => isPreorder(p) ? Math.max(0, p.preorder!.limit - p.preorder!.reserved) : p.stock;
export const salePrice = (p: Product) => isPreorder(p) ? p.preorder!.price : p.price;
export const availabilityLabel = (p: Product) => isPreorder(p) ? "প্রি-অর্ডার" : p.stock > 0 ? "স্টকে আছে" : "স্টক শেষ";
export const dateLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" }) : "নির্ধারিত হয়নি";
