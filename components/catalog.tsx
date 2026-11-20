"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, RotateCcw, SearchX } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "./store-provider";
import { categories, bn } from "@/lib/catalog";
import { BookCard } from "./book-card";
import { CategoryIcon } from "./category-icon";
import { availableQuantity, isPreorder, salePrice } from "@/lib/availability";

export function Catalog({ home = false, wishlistOnly = false }: { home?: boolean; wishlistOnly?: boolean }) {
  const { products, loading, error, refresh, wishlist } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const category = params.get("category") || "all";
  const query = (params.get("q") || "").trim();
  const sort = params.get("sort") || "featured";
  const publisher = params.get("publisher") || "";
  const language = params.get("language") || "";
  const availability = params.get("availability") || "";
  const minimum = params.get("min") || "", maximum = params.get("max") || "";
  const filtered = useMemo(() => {
    let list = products.filter((p) => (!wishlistOnly || wishlist.includes(p.id)) && (category === "all" || p.category === category) && (!query || `${p.title} ${p.author} ${p.publisher} ${p.translator || ""} ${p.isbn || ""} ${(p.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())) && (params.get("featured") !== "true" || p.featured) && (!publisher || p.publisher === publisher) && (!language || p.language === language) && (!availability || (availability === "preorder" ? isPreorder(p) : availability === "available" ? !isPreorder(p) && availableQuantity(p) > 0 : !isPreorder(p) && !availableQuantity(p))));
    if (minimum && Number.isFinite(Number(minimum))) list = list.filter((p) => salePrice(p) >= Number(minimum));
    if (maximum && Number.isFinite(Number(maximum))) list = list.filter((p) => salePrice(p) <= Number(maximum));
    if (params.get("discount") === "true") list = list.filter((p) => p.originalPrice > salePrice(p));
    if (sort === "price-asc") list = list.sort((a, b) => salePrice(a) - salePrice(b));
    else if (sort === "price-desc") list = list.sort((a, b) => salePrice(b) - salePrice(a));
    else if (sort === "newest") list = list.slice().reverse();
    else list = list.sort((a, b) => Number(b.featured) - Number(a.featured));
    return home ? list.slice(0, 5) : list;
  }, [products, wishlist, wishlistOnly, category, query, sort, params, home, publisher, language, availability, minimum, maximum]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(pageCount, Math.max(1, Math.floor(Number(params.get("page"))) || 1));
  const displayed = home ? filtered : filtered.slice((currentPage - 1) * 12, currentPage * 12);
  function changeParam(key: string, value: string) { const next = new URLSearchParams(params.toString()); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); router.push(`${wishlistOnly ? "/wishlist" : home ? "/" : "/books"}?${next}`, { scroll: false }); }
  return <section className={`catalog-section container ${home ? "home-catalog" : ""}`} id="books">
    {!wishlistOnly && <div className="category-row" aria-label="বইয়ের বিভাগ">{categories.map((c) => <button key={c.id} className={`category-pill ${category === c.id ? "active" : ""}`} aria-pressed={category === c.id} onClick={() => changeParam("category", c.id)}><CategoryIcon name={c.icon} /><span>{c.label}</span></button>)}</div>}
    <div className="section-heading"><div><span className="eyebrow">{wishlistOnly ? "আপনার পছন্দের সংগ্রহ" : home ? "ভালো বইয়ের সাথে সুন্দর পথচলা" : "পছন্দের বই, এক ঠিকানায়"}</span><h2>{wishlistOnly ? "ইচ্ছের তালিকা" : query ? `“${query}” এর ফলাফল` : home ? "নির্বাচিত বই" : "আমাদের বইয়ের সংগ্রহ"}<i /></h2></div>
      {home ? <Link href="/books" className="text-link">সবগুলো বই দেখুন <ArrowRight size={16} /></Link> : <label className="sort-control"><span>{bn(filtered.length)}টি বই</span><select aria-label="বই সাজান" value={sort} onChange={(e) => changeParam("sort", e.target.value)}><option value="featured">নির্বাচিত আগে</option><option value="newest">নতুন আগে</option><option value="price-asc">দাম: কম থেকে বেশি</option><option value="price-desc">দাম: বেশি থেকে কম</option></select></label>}
    </div>
    {!home && !wishlistOnly && <div className="catalog-filters"><label>প্রকাশনী<select value={publisher} onChange={(e) => changeParam("publisher", e.target.value)}><option value="">সব প্রকাশনী</option>{[...new Set(products.map((p) => p.publisher))].map((v) => <option key={v}>{v}</option>)}</select></label><label>ভাষা<select value={language} onChange={(e) => changeParam("language", e.target.value)}><option value="">সব ভাষা</option>{[...new Set(products.map((p) => p.language))].map((v) => <option key={v}>{v}</option>)}</select></label><label>প্রাপ্যতা<select value={availability} onChange={(e) => changeParam("availability", e.target.value)}><option value="">সব বই</option><option value="available">স্টকে আছে</option><option value="unavailable">স্টক শেষ</option><option value="preorder">প্রি-অর্ডার</option></select></label></div>}
    {!home && <form className="catalog-search-tools" key={`${query}-${minimum}-${maximum}`} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const next = new URLSearchParams(params.toString()); for (const key of ["q", "min", "max"]) { const value = String(values.get(key) || "").trim(); if (value) next.set(key, value); else next.delete(key); } next.delete("page"); router.push(`${wishlistOnly ? "/wishlist" : "/books"}?${next}`, { scroll: false }); }}><label>বই খুঁজুন<input name="q" type="search" defaultValue={query} placeholder="নাম, লেখক, প্রকাশনী বা ISBN" /></label><label>সর্বনিম্ন দাম (৳)<input name="min" type="number" min={0} max={100000} defaultValue={minimum} /></label><label>সর্বোচ্চ দাম (৳)<input name="max" type="number" min={minimum || 0} max={100000} defaultValue={maximum} /></label><button className="button">ফলাফল দেখুন</button><Link className="text-link" href={wishlistOnly ? "/wishlist" : "/books"}>সব ফিল্টার মুছুন</Link></form>}
    {!home && params.get("discount") === "true" && <p className="catalog-filter-note">শুধু ছাড়ের বই দেখানো হচ্ছে। <button className="text-link" onClick={() => changeParam("discount", "")}>এই ফিল্টার সরান</button></p>}
    {error ? <div className="empty-state"><SearchX /><h3>বইয়ের সংগ্রহ লোড হয়নি</h3><p>{error}</p><button className="button" onClick={() => void refresh()}><RotateCcw size={16} /> আবার চেষ্টা করুন</button></div>
      : loading ? <div className="book-grid" aria-label="বই লোড হচ্ছে">{Array.from({ length: 5 }, (_, i) => <div className="book-skeleton" key={i} />)}</div>
      : filtered.length ? <div className="book-grid">{displayed.map((p) => <BookCard key={p.id} product={p} />)}</div>
      : <div className="empty-state"><SearchX size={38} /><h3>{wishlistOnly ? "পছন্দের বইগুলো এখানে রাখুন" : "এই অনুসন্ধানে কোনো বই পাওয়া যায়নি"}</h3><p>{wishlistOnly ? "বইয়ের পাশের হৃদয় চিহ্নে চাপ দিলেই আপনার তালিকায় যোগ হবে।" : "অন্য নাম বা বিভাগ দিয়ে খুঁজে দেখুন।"}</p><Link href="/books" className="button">বইয়ের সংগ্রহ দেখুন <ArrowUpRight size={17} /></Link></div>}
    {!home && !loading && !error && pageCount > 1 && <nav className="catalog-pagination" aria-label="বইয়ের ফলাফলের পৃষ্ঠা"><button className="button button-outline" disabled={currentPage === 1} onClick={() => changeParam("page", String(currentPage - 1))}>আগের পৃষ্ঠা</button><span>পৃষ্ঠা {bn(currentPage)} / {bn(pageCount)}</span><button className="button button-outline" disabled={currentPage === pageCount} onClick={() => changeParam("page", String(currentPage + 1))}>পরের পৃষ্ঠা</button></nav>}
  </section>;
}
