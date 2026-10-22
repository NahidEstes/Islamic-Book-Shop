import { z } from "zod";

export const normalizePhone = (value: string) => {
  const digits = value.replace(/[০-৯]/g, (n) => String("০১২৩৪৫৬৭৮৯".indexOf(n))).replace(/[\s()-]/g, "");
  return digits.replace(/^\+?88(?=01)/, "");
};
export const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(/^01[3-9]\d{8}$/, "সঠিক বাংলাদেশি মোবাইল নম্বর দিন"));
export const customerSchema = z.object({
  name: z.string().trim().min(2, "আপনার নাম লিখুন").max(100),
  phone: phoneSchema,
  address: z.string().trim().min(10, "সম্পূর্ণ ডেলিভারির ঠিকানা লিখুন").max(600),
  city: z.string().trim().min(2, "শহর বা জেলার নাম লিখুন").max(100),
  zone: z.enum(["dhaka", "outside"]),
  note: z.string().trim().max(500).optional(),
});
export const orderSchema = z.object({
  customer: customerSchema,
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(20) })).min(1).max(50),
  paymentMethod: z.literal("cod"),
  acceptPreorderTerms: z.boolean().optional(),
}).refine((o) => new Set(o.items.map((i) => i.productId)).size === o.items.length, "একই বই একাধিকবার পাঠানো হয়েছে");
export const productSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
  title: z.string().trim().min(2).max(150), author: z.string().trim().min(2).max(150),
  publisher: z.string().trim().min(2).max(150), category: z.enum(["tafsir", "hadith", "seerah", "aqidah", "life", "children", "dua"]),
  price: z.number().int().min(1).max(100000), originalPrice: z.number().int().min(1).max(100000),
  stock: z.number().int().min(0).max(100000), pages: z.number().int().min(1).max(10000),
  language: z.string().min(1).max(50), edition: z.string().min(1).max(100), binding: z.string().min(1).max(50),
  featured: z.boolean(), coverTheme: z.enum(["sage", "sand", "emerald", "sky", "navy", "clay"]),
  description: z.string().min(10).max(5000), contents: z.array(z.string().max(150)).max(30),
  subtitle: z.string().max(200).optional(), translator: z.string().max(150).optional(), editor: z.string().max(150).optional(),
  isbn: z.string().max(20).refine((s) => !s || /^(?:\d[ -]?){9}[\dXx]$|^(?:\d[ -]?){13}$/.test(s), "ISBN-এর ফরম্যাট সঠিক নয়").optional(),
  publicationYear: z.number().int().min(600).max(2200).optional(), tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  coverAssetId: z.string().max(80).optional(), galleryAssetIds: z.array(z.string().max(80)).max(10).default([]), previewAssetIds: z.array(z.string().max(80)).max(30).default([]),
  previewPermission: z.boolean().default(false), previewPermissionNote: z.string().max(500).optional(), sample: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).max(10000).default(5),
  preorder: z.object({ enabled: z.boolean(), price: z.number().int().min(1).max(100000), limit: z.number().int().min(1).max(100000), reserved: z.number().int().min(0).default(0), publicationDate: z.iso.date(), dispatchDate: z.iso.date(), cancellationTerms: z.string().trim().min(10).max(1000) }).refine((p) => p.dispatchDate >= p.publicationDate, "ডেলিভারির সময় প্রকাশের তারিখের আগে হতে পারে না").optional(),
}).refine((p) => p.originalPrice >= p.price, "মূল দাম বিক্রয়মূল্যের চেয়ে কম হতে পারে না");
