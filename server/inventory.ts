import type { InventoryData, Purchase, Supplier, SupplierPayment } from "../lib/commerce-types";
import { createHash } from "node:crypto";
import type { PurchaseInput, ReceiveInput, SupplierPaymentInput } from "../lib/inventory-validation";
import { paidForPurchase, purchaseLineTotal } from "../lib/inventory";
import { restoreStockCost, takeStockCost } from "../lib/stock-cost";
import { allocateRound } from "../lib/money";
import { audit, CommerceService } from "./commerce";
import { id, StoreError, type Store } from "./store";

const timestamp = () => new Date().toISOString();
const minor = (amount: number) => Math.round(amount * 100);

export class InventoryService {
  constructor(private store: Store, private commerce: CommerceService) {}

  async overview(): Promise<InventoryData> {
    const data = await this.store.snapshot();
    const products = new Map(data.products.map((book) => [book.id, book]));
    const names = new Map(data.users.map((user) => [user.id, user.name]));
    return {
      products: data.products.map(({ id, title, stock, lowStockThreshold, preorder }) => ({ id, title, stock, lowStockThreshold, preorder })),
      suppliers: data.suppliers, purchases: data.purchases.slice().reverse(), payments: data.supplierPayments,
      movements: data.audit.filter((entry) => entry.stockChange).slice(-500).reverse().map((entry) => ({
        id: entry.id, at: entry.at, actorName: names.get(entry.actor) || entry.actor,
        productId: entry.target, title: products.get(entry.target)?.title || entry.target, action: entry.action, note: entry.note,
        change: { before: entry.stockChange!.before, after: entry.stockChange!.after, added: entry.stockChange!.added, purchaseId: entry.stockChange!.purchaseId },
      })),
    };
  }

  saveSupplier(input: Omit<Supplier, "id" | "createdAt">, actor: string, supplierId?: string) {
    return this.store.transaction((data) => {
      const current = supplierId ? data.suppliers.find((item) => item.id === supplierId) : undefined;
      if (supplierId && !current) throw new StoreError("সরবরাহকারী পাওয়া যায়নি।", 404);
      if (data.suppliers.some((item) => item.id !== supplierId && item.name.toLowerCase() === input.name.toLowerCase())) throw new StoreError("এই নামে সরবরাহকারী আছে।", 409);
      const supplier: Supplier = { ...input, id: current?.id || id("supplier"), createdAt: current?.createdAt || timestamp() };
      if (current) Object.assign(current, supplier);
      else data.suppliers.push(supplier);
      audit(data, actor, "supplier.save", supplier.id);
      return supplier;
    });
  }

  createPurchase(input: PurchaseInput, actor: string) {
    return this.store.transaction((data) => {
      const duplicate = data.purchases.find((purchase) => purchase.requestId === input.requestId && purchase.createdBy === actor);
      const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      if (duplicate) {
        if (duplicate.requestHash && duplicate.requestHash !== requestHash) throw new StoreError("ক্রয়ের অনুরোধটি অন্য তথ্যে ব্যবহৃত হয়েছে।", 409);
        return duplicate;
      }
      const supplier = data.suppliers.find((item) => item.id === input.supplierId && item.active);
      if (!supplier) throw new StoreError("সক্রিয় সরবরাহকারী নির্বাচন করুন।", 400);
      if (input.invoiceNo && data.purchases.some((purchase) => purchase.supplierId === supplier.id && purchase.invoiceNo.toLowerCase() === input.invoiceNo.toLowerCase())) throw new StoreError("এই সরবরাহকারীর চালান নম্বর আগে ব্যবহার করা হয়েছে।", 409);
      const lines = input.lines.map((line) => {
        const product = data.products.find((book) => book.id === line.productId);
        if (!product) throw new StoreError("বইটি পাওয়া যায়নি", 404);
        return { productId: product.id, title: product.title, quantity: line.quantity, unitCostMinor: minor(line.unitCost), received: 0 };
      });
      const subtotalMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitCostMinor, 0);
      const discountMinor = minor(input.discount);
      const freightMinor = minor(input.freight);
      if (discountMinor > subtotalMinor || subtotalMinor + freightMinor > 100000000000) throw new StoreError("ছাড় বা মোট ক্রয়মূল্য সঠিক নয়।", 400);
      if (input.receiptAssetId && !data.assets.some((asset) => asset.id === input.receiptAssetId && asset.kind === "receipt")) throw new StoreError("বিলের ফাইল পাওয়া যায়নি।", 400);
      const purchaseId = id("purchase");
      const purchase: Purchase = {
        id: purchaseId, number: `PUR-${purchaseId.slice(-10).toUpperCase()}`, supplierId: supplier.id, supplierName: supplier.name,
        invoiceNo: input.invoiceNo, date: input.date, dueDate: input.dueDate, lines, subtotalMinor, discountMinor, freightMinor,
        totalMinor: subtotalMinor - discountMinor + freightMinor, note: input.note, receiptAssetId: input.receiptAssetId,
        receipts: [], requestId: input.requestId, requestHash, createdAt: timestamp(), createdBy: actor,
      };
      data.purchases.push(purchase);
      audit(data, actor, "purchase.create", purchase.id);
      return purchase;
    });
  }

  setDueDate(purchaseId: string, dueDate: string | null, expected: string | null, actor: string) {
    return this.store.transaction((data) => {
      const purchase = data.purchases.find((item) => item.id === purchaseId);
      if (!purchase) throw new StoreError("ক্রয়ের রেকর্ড পাওয়া যায়নি।", 404);
      if ((purchase.dueDate ?? null) === dueDate) return purchase;
      if ((purchase.dueDate ?? null) !== expected) throw new StoreError("নির্ধারিত তারিখ ইতিমধ্যে বদলেছে। তথ্য রিফ্রেশ করুন।", 409);
      if (dueDate && dueDate < purchase.date) throw new StoreError("পরিশোধের নির্ধারিত তারিখ ক্রয়ের তারিখের আগে হতে পারে না।", 400);
      if (dueDate) purchase.dueDate = dueDate;
      else delete purchase.dueDate;
      audit(data, actor, "purchase.due-date", purchaseId);
      return purchase;
    });
  }

  receive(purchaseId: string, input: ReceiveInput, actor: string) {
    return this.store.transaction((data) => {
      const purchase = data.purchases.find((item) => item.id === purchaseId);
      if (!purchase) throw new StoreError("ক্রয়ের রেকর্ড পাওয়া যায়নি।", 404);
      const previous = purchase.receipts.find((receipt) => receipt.requestId === input.requestId);
      if (previous) {
        if (JSON.stringify(previous.items) !== JSON.stringify(input.items)) throw new StoreError("প্রাপ্তির অনুরোধটি অন্য তথ্যে ব্যবহৃত হয়েছে।", 409);
        return purchase;
      }
      for (const item of input.items) {
        const line = purchase.lines.find((line) => line.productId === item.productId);
        const product = data.products.find((book) => book.id === item.productId);
        if (!line || !product || item.quantity > line.quantity - line.received || product.stock + item.quantity > 100000) throw new StoreError("প্রাপ্ত কপি অবশিষ্ট পরিমাণ বা স্টকের সীমা ছাড়িয়েছে।", 409);
        const before = product.stock;
        const lineCost = purchaseLineTotal(purchase, line.productId);
        const receivedCost = allocateRound(lineCost, line.received + item.quantity, line.quantity) - allocateRound(lineCost, line.received, line.quantity);
        restoreStockCost(product, item.quantity, receivedCost);
        product.stock += item.quantity;
        line.received += item.quantity;
        this.commerce.restock(data, product, before);
        audit(data, actor, "purchase.received", product.id);
        data.audit[data.audit.length - 1].stockChange = { before, after: product.stock, added: item.quantity, purchaseId };
      }
      purchase.receipts.push({ id: id("receiving"), requestId: input.requestId, items: input.items, at: timestamp(), actor });
      return purchase;
    });
  }

  pay(purchaseId: string, input: SupplierPaymentInput, actor: string) {
    return this.store.transaction((data) => {
      const purchase = data.purchases.find((item) => item.id === purchaseId);
      if (!purchase) throw new StoreError("ক্রয়ের রেকর্ড পাওয়া যায়নি।", 404);
      const duplicate = data.supplierPayments.find((payment) => payment.createdBy === actor && payment.requestId === input.requestId);
      if (duplicate) {
        if (duplicate.purchaseId !== purchaseId || duplicate.amountMinor !== minor(input.amount)) throw new StoreError("পেমেন্ট অনুরোধটি আগে ব্যবহৃত হয়েছে।", 409);
        return duplicate;
      }
      const amountMinor = minor(input.amount);
      if (amountMinor > purchase.totalMinor - paidForPurchase(purchaseId, data.supplierPayments)) throw new StoreError("পরিশোধের পরিমাণ বকেয়ার চেয়ে বেশি।", 409);
      if (data.supplierPayments.some((payment) => payment.purchaseId === purchaseId && payment.reference.toLowerCase() === input.reference.toLowerCase())) throw new StoreError("এই পেমেন্ট রেফারেন্স আগে ব্যবহার করা হয়েছে।", 409);
      const payment: SupplierPayment = {
        id: id("supplier-payment"), purchaseId, amountMinor, reference: input.reference, method: input.method,
        date: input.date, note: input.note, requestId: input.requestId, createdAt: timestamp(), createdBy: actor,
      };
      data.supplierPayments.push(payment);
      audit(data, actor, "supplier.payment", purchaseId);
      return payment;
    });
  }

  adjust(input: { productId: string; delta: number; reason: string; requestId: string }, actor: string) {
    return this.store.transaction((data) => {
      const book = data.products.find((item) => item.id === input.productId);
      if (!book) throw new StoreError("বইটি পাওয়া যায়নি", 404);
      const duplicate = data.audit.find((entry) => entry.actor === actor && entry.stockChange?.requestId === input.requestId);
      if (duplicate) {
        if (duplicate.target !== book.id || duplicate.stockChange!.after - duplicate.stockChange!.before !== input.delta) throw new StoreError("এই অনুরোধটি অন্য স্টক পরিবর্তনে ব্যবহৃত হয়েছে।", 409);
        return book;
      }
      const before = book.stock;
      if (before + input.delta < 0 || before + input.delta > 100000) throw new StoreError("স্টক শূন্য থেকে ১০০০০০ কপির মধ্যে হতে হবে।", 409);
      if (input.delta < 0) takeStockCost(book, -input.delta);
      book.stock += input.delta;
      this.commerce.restock(data, book, before);
      audit(data, actor, "inventory.adjustment", book.id);
      data.audit[data.audit.length - 1].stockChange = { before, after: book.stock, requestId: input.requestId };
      data.audit[data.audit.length - 1].note = input.reason;
      return book;
    });
  }
}
