import { isLowStock } from "./availability";
import type { InventoryData, Purchase } from "./commerce-types";
import { paidForPurchase, purchaseStatus } from "./inventory";

export type InventoryRange = { from: string; to: string };
export type InventoryPeriod = "today" | "month" | "last-month" | "all" | "custom";
export type SupplierDue = {
  supplierId: string; name: string; totalMinor: number; overdueMinor: number; nextDue?: string;
  invoices: { purchase: Purchase; dueMinor: number }[];
};

export function inventoryPeriodRange(period: Exclude<InventoryPeriod, "custom">, today: string): InventoryRange {
  if (period === "all") return { from: "", to: "" };
  if (period === "today") return { from: today, to: today };
  const start = `${today.slice(0, 7)}-01`;
  if (period === "month") return { from: start, to: today };
  const previousEnd = new Date(`${start}T12:00:00Z`);
  previousEnd.setUTCDate(0);
  const to = previousEnd.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

const eventDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh" });
export function inventoryOverview(data: InventoryData, range: InventoryRange, today: string) {
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
  const purchases = data.purchases.filter((purchase) => inRange(purchase.date)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const payments = data.payments.filter((payment) => inRange(payment.date));
  const groups = new Map<string, SupplierDue>();
  for (const purchase of data.purchases) {
    const dueMinor = Math.max(0, purchase.totalMinor - paidForPurchase(purchase.id, data.payments));
    if (!dueMinor) continue;
    let group = groups.get(purchase.supplierId);
    if (!group) {
      group = { supplierId: purchase.supplierId, name: data.suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name || purchase.supplierName, totalMinor: 0, overdueMinor: 0, invoices: [] };
      groups.set(purchase.supplierId, group);
    }
    group.totalMinor += dueMinor;
    if (purchase.dueDate && purchase.dueDate < today) group.overdueMinor += dueMinor;
    if (purchase.dueDate && (!group.nextDue || purchase.dueDate < group.nextDue)) group.nextDue = purchase.dueDate;
    group.invoices.push({ purchase, dueMinor });
  }
  const supplierDues = [...groups.values()].sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999") || b.totalMinor - a.totalMinor);
  for (const group of supplierDues) group.invoices.sort((a, b) => (a.purchase.dueDate || "9999").localeCompare(b.purchase.dueDate || "9999") || a.purchase.date.localeCompare(b.purchase.date));

  const months = new Map<string, { month: string; purchasesMinor: number; paymentsMinor: number }>();
  function monthBucket(date: string) {
    const month = date.slice(0, 7);
    if (!months.has(month)) months.set(month, { month, purchasesMinor: 0, paymentsMinor: 0 });
    return months.get(month)!;
  }
  for (const purchase of purchases) monthBucket(purchase.date).purchasesMinor += purchase.totalMinor;
  for (const payment of payments) monthBucket(payment.date).paymentsMinor += payment.amountMinor;
  const pending = data.purchases.filter((purchase) => purchaseStatus(purchase) !== "received").sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return {
    purchases, payments, pending, supplierDues,
    purchasedMinor: purchases.reduce((sum, purchase) => sum + purchase.totalMinor, 0),
    paidMinor: payments.reduce((sum, payment) => sum + payment.amountMinor, 0),
    dueMinor: supplierDues.reduce((sum, group) => sum + group.totalMinor, 0),
    stock: data.products.reduce((sum, book) => sum + book.stock, 0),
    urgent: data.products.filter(isLowStock).sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title)),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    movements: data.movements.filter((entry) => inRange(eventDay.format(new Date(entry.at)))).sort((a, b) => b.at.localeCompare(a.at)),
  };
}
