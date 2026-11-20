import type { Purchase, SupplierPayment } from "./commerce-types";
import { allocateRound } from "./money";

export function paidForPurchase(purchaseId: string, payments: SupplierPayment[]) {
  return payments.filter((payment) => payment.purchaseId === purchaseId).reduce((sum, payment) => sum + payment.amountMinor, 0);
}

export function purchaseStatus(purchase: Purchase) {
  if (purchase.lines.every((line) => line.received === line.quantity)) return "received";
  return purchase.lines.some((line) => line.received > 0) ? "partial" : "pending";
}

export function purchaseLineCost(purchase: Purchase, productId: string) {
  const line = purchase.lines.find((item) => item.productId === productId)!;
  const units = purchase.lines.reduce((sum, item) => sum + item.quantity, 0);
  const proportion = purchase.subtotalMinor ? line.quantity * line.unitCostMinor / purchase.subtotalMinor : line.quantity / units;
  return purchase.totalMinor * proportion / line.quantity;
}

export function purchaseLineTotal(purchase: Purchase, productId: string) {
  const units = purchase.lines.reduce((n, line) => n + line.quantity, 0);
  const base = purchase.subtotalMinor || units;
  let before = 0;
  for (const line of purchase.lines) {
    const weight = purchase.subtotalMinor ? line.quantity * line.unitCostMinor : line.quantity;
    if (line.productId === productId) return allocateRound(purchase.totalMinor, before + weight, base) - allocateRound(purchase.totalMinor, before, base);
    before += weight;
  }
  return 0;
}
