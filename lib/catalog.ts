import type { Product } from "./types";

export const categories = [
  { id: "all", label: "সব বিভাগ", icon: "book" },
  { id: "tafsir", label: "তাফসির", icon: "open" },
  { id: "hadith", label: "হাদিস", icon: "library" },
  { id: "seerah", label: "সীরাত", icon: "mosque" },
  { id: "aqidah", label: "আকিদা ও বিশ্বাস", icon: "leaf" },
  { id: "life", label: "ইসলামী জীবন", icon: "heart" },
  { id: "children", label: "শিশুদের বই", icon: "sun" },
  { id: "dua", label: "দোয়া ও যিকির", icon: "moon" },
] as const;

// All entries are fictional demo products, not a verified publisher catalog.
const base = { publisher: "নূর প্রকাশন · নমুনা", language: "বাংলা", edition: "নমুনা সংস্করণ, ২০২৬", binding: "হার্ডকভার", stock: 20 };
export const seedProducts: Product[] = [
  { ...base, id: "b001", slug: "islami-jibondorshon", title: "ইসলামী জীবনদর্শন", author: "নূর সম্পাদকীয় দল", category: "life", price: 450, originalPrice: 550, pages: 280, featured: true, coverTheme: "sage", description: "বিশ্বাস, সুন্দর আচরণ ও দৈনন্দিন জীবনের মূল্যবোধ নিয়ে একটি নমুনা বই। জীবনকে অর্থপূর্ণ করে গড়ে তোলার নানা বিষয় সহজ ভাষায় উপস্থাপিত।", contents: ["জীবনের উদ্দেশ্য", "সুন্দর আচরণের চর্চা", "পরিবার ও সমাজ", "প্রতিদিনের আত্মপর্যালোচনা"] },
  { ...base, id: "b002", slug: "seerat-path", title: "সীরাতের আলোয়", author: "নূর গবেষণা বিভাগ", category: "seerah", price: 380, originalPrice: 480, pages: 320, featured: true, coverTheme: "sand", description: "সীরাত পাঠের প্রতি আগ্রহ তৈরির জন্য সাজানো একটি নমুনা প্রকাশনা। পাঠককে আরও গভীর অধ্যয়ন ও নির্ভরযোগ্য উৎসের দিকে এগিয়ে দেওয়াই এই সংগ্রহের উদ্দেশ্য।", contents: ["সীরাত পাঠের ভূমিকা", "শৈশব ও কৈশোর", "মক্কার জীবন", "মদিনার সমাজ"] },
  { ...base, id: "b003", slug: "tafsir-porichiti", title: "তাফসিরের পরিচিতি", author: "নূর গবেষণা বিভাগ", category: "tafsir", price: 290, originalPrice: 350, pages: 224, featured: true, coverTheme: "emerald", description: "তাফসির অধ্যয়নের প্রাথমিক ধারণা, পরিভাষা ও পাঠের প্রস্তুতি নিয়ে একটি নমুনা বই। এটি পূর্ণাঙ্গ তাফসির বা ধর্মীয় সিদ্ধান্তের উৎস নয়।", contents: ["তাফসির কী", "অধ্যয়নের প্রস্তুতি", "প্রয়োজনীয় পরিভাষা", "আরও পড়ার নির্দেশনা"] },
  { ...base, id: "b004", slug: "shishuder-seerat", title: "আমাদের প্রিয় নবী", author: "নূর শিশু বিভাগ", category: "children", price: 250, originalPrice: 300, pages: 96, featured: true, coverTheme: "sky", description: "শিশুদের জন্য সহজ ভাষা ও রঙিন প্রচ্ছদে সাজানো নমুনা বই। পরিবারের সঙ্গে একসঙ্গে পড়া ও ভালো আচরণ নিয়ে আলাপের উপযোগী।", contents: ["ভালোবাসার গল্প", "সত্য কথা বলা", "মানুষের প্রতি দয়া", "ছোটদের ভালো কাজ"] },
  { ...base, id: "b005", slug: "dua-o-zikr", title: "দোয়া ও যিকির", author: "নূর সম্পাদকীয় দল", category: "dua", price: 270, originalPrice: 330, pages: 160, featured: true, coverTheme: "navy", description: "দোয়া ও যিকিরের গুরুত্ব এবং নিয়মিত পাঠের অভ্যাস নিয়ে একটি নমুনা প্রকাশনা। চূড়ান্ত প্রকাশের আগে বিষয়বস্তু ও সূত্র সম্পাদকীয় যাচাই প্রয়োজন।", contents: ["দোয়ার গুরুত্ব", "দৈনন্দিন পাঠের অভ্যাস", "সকাল ও সন্ধ্যা", "কৃতজ্ঞতার চর্চা"] },
  { ...base, id: "b006", slug: "hadith-pather-shuru", title: "হাদিস পাঠের শুরু", author: "নূর গবেষণা বিভাগ", category: "hadith", price: 340, originalPrice: 420, pages: 248, featured: false, coverTheme: "clay", description: "হাদিস পাঠের প্রাথমিক ধারণা নিয়ে একটি নমুনা বই। পরিচিতি, পরিভাষা ও নিয়মিত অধ্যয়নের পরিকল্পনা একসঙ্গে সাজানো হয়েছে।", contents: ["হাদিসের পরিচয়", "মৌলিক পরিভাষা", "অধ্যয়নের আদব", "পাঠ পরিকল্পনা"] },
  { ...base, id: "b007", slug: "imaner-alo", title: "ঈমানের আলো", author: "নূর সম্পাদকীয় দল", category: "aqidah", price: 220, originalPrice: 280, pages: 180, featured: false, coverTheme: "emerald", description: "বিশ্বাস, আত্মপর্যালোচনা ও নৈতিক চর্চা নিয়ে সাজানো নমুনা প্রকাশনা। সহজ পাঠ ও সুন্দর মুদ্রণ পরিকল্পনার একটি উদাহরণ।", contents: ["বিশ্বাসের পরিচর্যা", "চিন্তা ও আত্মপর্যালোচনা", "সুন্দর চরিত্র", "নিয়মিত অধ্যয়ন"] },
  { ...base, id: "b008", slug: "poribarer-pathshala", title: "পরিবারের পাঠশালা", author: "নূর পরিবার বিভাগ", category: "life", price: 310, originalPrice: 390, pages: 208, featured: false, coverTheme: "sand", description: "পরিবারে বই পড়া, পারস্পরিক শ্রদ্ধা ও শিশুদের সঙ্গে সুন্দর সময় কাটানো নিয়ে একটি নমুনা বই।", contents: ["একসঙ্গে বই পড়া", "শিশুর সঙ্গে আলাপ", "সম্পর্কে শ্রদ্ধা", "পরিবারের পাঠাগার"] },
  { ...base, id: "b009", slug: "chhotoder-bhalo-kaj", title: "ছোটদের ভালো কাজ", author: "নূর শিশু বিভাগ", category: "children", price: 180, originalPrice: 220, pages: 64, featured: false, coverTheme: "sky", description: "ছোট ছোট ভালো অভ্যাস ও সুন্দর আচরণের জন্য শিশুদের উপযোগী একটি রঙিন নমুনা বই।", contents: ["সালাম ও শুভেচ্ছা", "বন্ধুর পাশে", "পরিচ্ছন্নতা", "প্রতিদিন একটি ভালো কাজ"] },
  { ...base, id: "b010", slug: "ramadan-prostuti", title: "রমাদানের প্রস্তুতি", author: "নূর সম্পাদকীয় দল", category: "life", price: 200, originalPrice: 250, pages: 144, featured: false, coverTheme: "navy", description: "রমাদানের পাঠ, সময় ব্যবস্থাপনা ও ব্যক্তিগত পরিকল্পনা নিয়ে একটি নমুনা সংগ্রহ।", contents: ["পাঠের পরিকল্পনা", "সময়ের যত্ন", "দান ও সহমর্মিতা", "আত্মপর্যালোচনা"] },
];

export const bn = (value: number) => new Intl.NumberFormat("bn-BD").format(value);
export const money = (value: number) => `৳ ${bn(value)}`;
export const categoryName = (id: string) => categories.find((c) => c.id === id)?.label || id;
export const deliveryFee = (zone: "dhaka" | "outside") => zone === "dhaka" ? 60 : 120;
