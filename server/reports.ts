import { z } from "zod";
import { businessReport } from "../lib/business-report";
import { restoreStockCost } from "../lib/stock-cost";
import { id, StoreError, type Store } from "./store";
import { audit } from "./commerce";

export const expenseSchema = z.object({ date: z.iso.date(), category: z.enum(["packaging", "courier", "rent", "other"]), amountMinor: z.number().int().min(1).max(100000000), note: z.string().trim().min(3).max(500), reference: z.string().trim().min(2).max(100), requestId: z.uuid() });
export const openingCostSchema = z.object({ unitCostMinor: z.number().int().min(0).max(10000000), expectedStock: z.number().int().min(0), expectedKnown: z.number().int().min(0), requestId: z.uuid() });
export class ReportService {
  constructor(private store: Store) {}
  async report(from?: string, to?: string) { return businessReport(await this.store.snapshot(), from, to); }
  expense(input: z.infer<typeof expenseSchema>, actor: string) {
    return this.store.transaction((d) => {
      const old = d.expenses.find((e) => e.recordedBy === actor && e.requestId === input.requestId);
      if (old) { if (old.amountMinor !== input.amountMinor || old.reference !== input.reference || old.date !== input.date || old.category !== input.category || old.note !== input.note) throw new StoreError("এই খরচের অনুরোধটি আগে ব্যবহৃত হয়েছে।", 409); return old; }
      if (d.expenses.some((e) => e.reference.toLowerCase() === input.reference.toLowerCase())) throw new StoreError("এই খরচের রেফারেন্স আগে ব্যবহার হয়েছে।", 409);
      const expense = { ...input, id: id("expense"), createdAt: new Date().toISOString(), recordedBy: actor };
      d.expenses.push(expense); audit(d, actor, "expense.record", expense.id); return expense;
    });
  }
  voidExpense(expenseId: string, actor: string) {
    return this.store.transaction((d) => { const e = d.expenses.find((e) => e.id === expenseId); if (!e) throw new StoreError("খরচ পাওয়া যায়নি।", 404); if (!e.voidedAt) { e.voidedAt = new Date().toISOString(); audit(d, actor, "expense.void", e.id); } return e; });
  }
  openingCost(productId: string, input: z.infer<typeof openingCostSchema>, actor: string) {
    return this.store.transaction((d) => {
      const p = d.products.find((p) => p.id === productId); if (!p) throw new StoreError("বইটি পাওয়া যায়নি", 404);
      const old = d.audit.find((a) => a.actor === actor && a.action === "inventory.opening-cost" && a.stockChange?.requestId === input.requestId);
      if (old) { if (old.target !== productId || old.note !== String(input.unitCostMinor)) throw new StoreError("এই অনুরোধটি আগে ব্যবহৃত হয়েছে।", 409); return p; }
      if (p.stock !== input.expectedStock || (p.stockCost?.quantity || 0) !== input.expectedKnown) throw new StoreError("স্টক ইতিমধ্যে বদলেছে। রিফ্রেশ করুন।", 409);
      const quantity = p.stock - (p.stockCost?.quantity || 0);
      if (!quantity) throw new StoreError("এই বইয়ের সব কপির ক্রয়মূল্য জানা আছে।", 409);
      restoreStockCost(p, quantity, quantity * input.unitCostMinor);
      audit(d, actor, "inventory.opening-cost", p.id);
      Object.assign(d.audit[d.audit.length - 1], { note: String(input.unitCostMinor), stockChange: { before: p.stock, after: p.stock, requestId: input.requestId } }); return p;
    });
  }
}
