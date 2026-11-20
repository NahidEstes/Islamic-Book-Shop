import { z } from "zod";

const money = z.number().min(0).max(1000000000).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < .00001, "সর্বোচ্চ দুই দশমিক ঘর ব্যবহার করুন।");
const requestId = z.string().uuid();
export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(150), phone: z.string().trim().max(50).default(""),
  email: z.union([z.email().trim().toLowerCase(), z.literal("")]).default(""), address: z.string().trim().max(600).default(""),
  note: z.string().trim().max(1000).default(""), active: z.boolean().default(true),
});
export const purchaseSchema = z.object({
  supplierId: z.string().min(1).max(80), invoiceNo: z.string().trim().max(80).default(""), date: z.iso.date(), dueDate: z.iso.date().optional(),
  lines: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(100000), unitCost: money })).min(1).max(50),
  discount: money.default(0), freight: money.default(0), note: z.string().trim().max(1500).default(""),
  receiptAssetId: z.string().max(80).optional(), requestId,
}).refine((input) => new Set(input.lines.map((line) => line.productId)).size === input.lines.length, "একই বই দুবার যোগ করা যাবে না")
  .refine((input) => !input.dueDate || input.dueDate >= input.date, { message: "পরিশোধের নির্ধারিত তারিখ ক্রয়ের তারিখের আগে হতে পারে না।", path: ["dueDate"] });
export const purchaseDueDateSchema = z.object({ dueDate: z.iso.date().nullable(), expected: z.iso.date().nullable() });
export const receivingSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(100000) })).min(1).max(50), requestId,
}).refine((input) => new Set(input.items.map((line) => line.productId)).size === input.items.length, "একই বই দুবার যোগ করা যাবে না");
export const supplierPaymentSchema = z.object({
  amount: money.refine((amount) => amount > 0), reference: z.string().trim().min(2).max(120),
  method: z.enum(["cash", "bank"]), date: z.iso.date(), note: z.string().trim().max(1000).default(""), requestId,
});
export const adjustmentSchema = z.object({
  productId: z.string().min(1).max(80), delta: z.number().int().min(-100000).max(100000).refine((delta) => delta !== 0),
  reason: z.string().trim().min(5).max(500), requestId,
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type ReceiveInput = z.infer<typeof receivingSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
