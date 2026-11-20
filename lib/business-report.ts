import type { ShopData } from "./commerce-types";
import { paidForPurchase } from "./inventory";
import { returnedLine } from "./stock-cost";

const localDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka" });
export function businessReport(data: ShopData, from = "", to = "") {
  const inside = (day: string) => (!from || day >= from) && (!to || day <= to);
  const day = (at: string) => localDay.format(new Date(at));
  const orders = data.orders.filter((o) => !o.demo && o.status === "delivered" && inside(day(o.deliveredAt || o.createdAt)));
  const rows = new Map(data.products.map((p) => [p.id, { id: p.id, title: p.title, sold: 0, returned: 0, revenueMinor: 0, costMinor: 0, unknownQuantity: 0, stock: p.stock, stockValueMinor: p.stockCost?.valueMinor || 0, unknownStock: Math.max(0, p.stock - (p.stockCost?.quantity || 0)) }]));
  const get = (id: string, title: string) => {
    if (!rows.has(id)) rows.set(id, { id, title, sold: 0, returned: 0, revenueMinor: 0, costMinor: 0, unknownQuantity: 0, stock: 0, stockValueMinor: 0, unknownStock: 0 });
    return rows.get(id)!;
  };
  const months = new Map<string, { month: string; revenueMinor: number; expensesMinor: number }>();
  const month = (date: string) => { const key = date.slice(0, 7); if (!months.has(key)) months.set(key, { month: key, revenueMinor: 0, expensesMinor: 0 }); return months.get(key)!; };
  let deliveryMinor = 0, unknownReturns = 0, legacyDates = 0;
  for (const order of orders) {
    if (!order.deliveredAt) legacyDates++;
    deliveryMinor += Math.round(order.delivery * 100);
    for (const line of order.items) {
      const row = get(line.productId, line.title);
      const revenue = Math.round(line.price * 100) * line.quantity - (line.discountMinor || 0);
      row.sold += line.quantity; row.revenueMinor += revenue;
      row.costMinor += line.cost?.knownMinor || 0;
      row.unknownQuantity += line.cost?.unknownQuantity ?? line.quantity;
      month(day(order.deliveredAt || order.createdAt)).revenueMinor += revenue;
    }
  }
  for (const returned of data.returns.filter((r) => r.status === "received" && inside(day(r.receivedAt || r.createdAt)))) {
    const order = data.orders.find((o) => o.id === returned.orderId && !o.demo);
    if (!order) continue;
    if (!returned.receivedAt) legacyDates++;
    for (const item of returned.items) {
      const line = order.items.find((i) => i.productId === item.productId);
      if (!line) continue;
      const prior = data.returns.filter((r) => r.id !== returned.id && r.orderId === order.id && r.status === "received" && (r.receivedAt || r.createdAt) < (returned.receivedAt || returned.createdAt)).flatMap((r) => r.items).filter((i) => i.productId === item.productId).reduce((n, i) => n + i.quantity, 0);
      const value = returnedLine(line, item.quantity, prior);
      const saved = returned.accounting?.lines?.find((v) => v.productId === item.productId);
      const returnedRevenue = saved?.revenueMinor ?? value.revenueMinor;
      const row = get(item.productId, line.title);
      row.returned += item.quantity; row.revenueMinor -= returnedRevenue;
      if (returned.restocked) {
        row.costMinor -= saved?.costRecoveredMinor ?? (returned.accounting ? value.costMinor : 0);
        const unknown = saved?.unknownQuantity ?? (returned.accounting ? item.quantity - value.knownQuantity : item.quantity);
        unknownReturns += unknown;
        row.unknownQuantity += unknown;
      }
      month(day(returned.receivedAt || returned.createdAt)).revenueMinor -= returnedRevenue;
    }
  }
  const expenses = data.expenses.filter((e) => !e.voidedAt && inside(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  for (const expense of expenses) month(expense.date).expensesMinor += expense.amountMinor;
  const books = [...rows.values()].sort((a, b) => (b.sold - b.returned) - (a.sold - a.returned) || b.revenueMinor - a.revenueMinor);
  const revenueMinor = books.reduce((n, b) => n + b.revenueMinor, 0);
  const costMinor = books.reduce((n, b) => n + b.costMinor, 0);
  const unknownQuantity = books.reduce((n, b) => n + b.unknownQuantity, 0);
  const expensesMinor = expenses.reduce((n, e) => n + e.amountMinor, 0);
  const customerDuesMinor = data.orders.filter((o) => !o.demo && o.status !== "cancelled").reduce((n, o) => {
    const credit = data.returns.filter((r) => r.orderId === o.id && r.status === "received").reduce((s, r) => s + (r.accounting?.revenueMinor ?? r.items.reduce((total, item) => { const line = o.items.find((line) => line.productId === item.productId); return total + (line ? returnedLine(line, item.quantity).revenueMinor : 0); }, 0)), 0);
    const paid = data.payments.filter((p) => p.orderId === o.id).reduce((s, p) => s + Math.round(p.amount * 100), 0);
    const refunded = data.refunds.filter((r) => r.orderId === o.id && r.status === "completed").reduce((s, r) => s + Math.round(r.amount * 100), 0);
    return n + Math.max(0, Math.round(o.total * 100) - credit - paid + refunded);
  }, 0);
  const supplierDuesMinor = data.purchases.reduce((n, p) => n + Math.max(0, p.totalMinor - paidForPurchase(p.id, data.supplierPayments)), 0);
  const actualOrders = new Set(data.orders.filter((o) => !o.demo).map((o) => o.id));
  return { from, to, revenueMinor, deliveryMinor, costMinor, expensesMinor,
    grossProfitMinor: unknownQuantity ? null : revenueMinor - costMinor,
    resultMinor: unknownQuantity ? null : revenueMinor + deliveryMinor - costMinor - expensesMinor,
    unknownQuantity, unknownReturns, legacyDates, customerDuesMinor, supplierDuesMinor,
    collectedMinor: data.payments.filter((p) => actualOrders.has(p.orderId) && inside(day(p.createdAt))).reduce((n, p) => n + Math.round(p.amount * 100), 0),
    refundedMinor: data.refunds.filter((r) => actualOrders.has(r.orderId) && r.status === "completed" && r.completedAt && inside(day(r.completedAt))).reduce((n, r) => n + Math.round(r.amount * 100), 0),
    inventoryValueMinor: books.reduce((n, b) => n + b.stockValueMinor, 0),
    unknownStock: books.reduce((n, b) => n + b.unknownStock, 0),
    books, expenses, months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)) };
}
export type BusinessReport = ReturnType<typeof businessReport>;
