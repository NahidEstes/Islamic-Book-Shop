import type { Order, Product } from "./types";
import type { ReturnRequest } from "./commerce-types";
import { allocateRound } from "./money";

// Moving weighted average for known-cost copies. Unpriced opening stock stays unknown.
export function takeStockCost(product: Product, quantity: number) {
  const pool = product.stockCost || { quantity: 0, valueMinor: 0 };
  const known = Math.min(quantity, pool.quantity);
  const value = pool.quantity ? allocateRound(pool.valueMinor, known, pool.quantity) : 0;
  product.stockCost = { quantity: pool.quantity - known, valueMinor: pool.valueMinor - value };
  return { knownMinor: value, unknownQuantity: quantity - known };
}
export function restoreStockCost(product: Product, quantity: number, valueMinor: number) {
  const pool = product.stockCost || { quantity: 0, valueMinor: 0 };
  product.stockCost = { quantity: pool.quantity + quantity, valueMinor: pool.valueMinor + valueMinor };
}
export function returnedLine(line: Order["items"][number], quantity: number, prior = 0) {
  const known = line.quantity - (line.cost?.unknownQuantity ?? line.quantity);
  const cumulative = (copies: number) => ({
    revenue: Math.floor((Math.round(line.price * 100) * line.quantity - (line.discountMinor || 0)) * copies / line.quantity),
    knownQuantity: Math.min(known, copies),
    cost: known ? Math.round((line.cost?.knownMinor || 0) * Math.min(known, copies) / known) : 0,
  });
  const a = cumulative(prior), b = cumulative(prior + quantity);
  return { revenueMinor: b.revenue - a.revenue, knownQuantity: b.knownQuantity - a.knownQuantity, costMinor: b.cost - a.cost };
}
export function publicOrder(order: Order): Order {
  return { ...order, items: order.items.map(({ cost: _cost, ...line }) => line) };
}
export function publicProduct(product: Product): Product {
  const { stockCost: _cost, ...safe } = product; return safe;
}
export function publicReturn(returned: ReturnRequest): ReturnRequest {
  const { accounting: _accounting, ...safe } = returned; return safe;
}
