import { z } from "zod";
import type { Coupon, ShopData } from "../lib/commerce-types";
import type { Order } from "../lib/types";
import { id, StoreError, type Store } from "./store";
import { audit } from "./commerce";
import { allocateFloor } from "../lib/money";

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/),
  type: z.enum(["percent", "fixed"]), value: z.number().int().min(1).max(100000),
  minimumMinor: z.number().int().min(0).max(100000000), maximumMinor: z.number().int().min(1).max(100000000).optional(),
  starts: z.iso.date(), ends: z.iso.date(), limit: z.number().int().min(1).max(1000000),
  productIds: z.array(z.string().min(1).max(60)).max(500).default([]), active: z.boolean(),
}).refine((i) => i.ends >= i.starts && (i.type !== "percent" || i.value <= 100), "মেয়াদ বা ছাড়ের পরিমাণ সঠিক নয়।");
export function couponUsage(data: ShopData, id: string) { return data.orders.filter((o) => o.coupon?.id === id && o.status !== "cancelled").length; }
export function applyCoupon(data: ShopData, order: Order, code: string) {
  const coupon = data.coupons.find((c) => c.code === code.trim().toUpperCase());
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka" }).format(new Date());
  if (!coupon || !coupon.active || today < coupon.starts || today > coupon.ends || couponUsage(data, coupon.id) >= coupon.limit) throw new StoreError("কুপনটি এখন ব্যবহার করা যাচ্ছে না।", 409);
  if (Math.round(order.subtotal * 100) < coupon.minimumMinor) throw new StoreError("এই কুপনের ন্যূনতম অর্ডার মূল্য পূরণ হয়নি।");
  const eligible = order.items.filter((line) => !coupon.productIds.length || coupon.productIds.includes(line.productId));
  const base = eligible.reduce((n, line) => n + Math.round(line.price * 100) * line.quantity, 0);
  if (!base) throw new StoreError("কার্টের কোনো বই এই কুপনের আওতায় নেই।");
  const discount = Math.min(base, coupon.maximumMinor ?? base, coupon.type === "percent" ? Math.floor(base * coupon.value / 100) : coupon.value * 100);
  let cumulative = 0, allocated = 0;
  for (const line of eligible) {
    cumulative += Math.round(line.price * 100) * line.quantity;
    const target = allocateFloor(discount, cumulative, base);
    line.discountMinor = target - allocated; allocated = target;
  }
  order.coupon = { id: coupon.id, code: coupon.code, discountMinor: discount };
  order.total = (Math.round((order.subtotal + order.delivery) * 100) - discount) / 100;
  return order;
}
export class CouponService {
  constructor(private store: Store) {}
  async list() { const d = await this.store.snapshot(); return d.coupons.map((c) => ({ ...c, used: couponUsage(d, c.id) })); }
  save(input: z.infer<typeof couponSchema>, actor: string, couponId?: string, expectedVersion?: number) {
    return this.store.transaction((data) => {
      const old = data.coupons.find((c) => c.id === couponId);
      if (couponId && !old) throw new StoreError("কুপন পাওয়া যায়নি।", 404);
      if (old && old.version !== expectedVersion) throw new StoreError("কুপনটি ইতিমধ্যে বদলেছে। রিফ্রেশ করুন।", 409);
      if (data.coupons.some((c) => c.code === input.code && c.id !== couponId)) throw new StoreError("এই কুপন কোড আগে ব্যবহার হয়েছে।", 409);
      if (input.productIds.some((id) => !data.products.some((p) => p.id === id))) throw new StoreError("কুপনের একটি বই পাওয়া যায়নি।");
      const coupon: Coupon = { ...input, id: old?.id || id("coupon"), version: (old?.version || 0) + 1, createdAt: old?.createdAt || new Date().toISOString() };
      if (old) Object.assign(old, coupon); else data.coupons.push(coupon);
      audit(data, actor, "coupon.save", coupon.id); return coupon;
    });
  }
}
