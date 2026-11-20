"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Heart, Minus, Plus, ShoppingCart, Truck, BookOpen, ShieldCheck } from "lucide-react";
import { useStore } from "./store-provider";
import { BookCover } from "./book-cover";
import { BookCard } from "./book-card";
import { bn, money, categoryName } from "@/lib/catalog";
import { availableQuantity, isPreorder, salePrice, dateLabel } from "@/lib/availability";
import { BookPreview } from "./book-preview";
import { ProductReviews, StockAlert } from "./product-community";
export function ProductDetail({ slug }: { slug: string }) {
  const { products, loading, error, refresh, addToCart, wishlist, toggleWishlist } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("description");
  const [gallery, setGallery] = useState<string | undefined>();
  const router = useRouter();
  const p = products.find((p) => p.slug === slug);
  if (loading) return <div className="container page-content loading-line">বইয়ের তথ্য লোড হচ্ছে...</div>;
  if (error) return <div className="container empty-state"><p>{error}</p><button className="button" onClick={() => void refresh()}>আবার চেষ্টা করুন</button></div>;
  if (!p) return <div className="container empty-state"><BookOpen size={38} /><h1>বইটি পাওয়া যায়নি</h1><Link href="/books" className="button">সব বই দেখুন</Link></div>;
  const related = products.filter((r) => r.id !== p.id && r.category === p.category).slice(0, 5);
  return <div className="container detail-page">
    <nav className="breadcrumbs" aria-label="অবস্থান"><Link href="/">হোম</Link><ChevronRight size={13} /><Link href="/books">বই</Link><ChevronRight size={13} /><span>{p.title}</span></nav>
    <section className="product-detail"><div className="detail-art"><BookCover product={p} assetId={gallery} /><span className="art-caption">{p.sample !== false ? "নমুনা প্রচ্ছদ · ডেমো সংগ্রহ" : p.publisher}</span>{!!p.galleryAssetIds?.length && <div className="gallery-thumbs">{[p.coverAssetId, ...p.galleryAssetIds].filter(Boolean).map((assetId) => <button key={assetId} aria-label="বইয়ের ছবি দেখুন" onClick={() => setGallery(assetId)}><img src={p.demoAssetUrls?.[assetId!] || `/api/media/${assetId}`} alt={p.title} /></button>)}</div>}</div>
      <div className="detail-copy"><Link href={`/books?category=${p.category}`} className="eyebrow">{categoryName(p.category)}</Link><h1>{p.title}</h1>{p.subtitle && <p className="muted">{p.subtitle}</p>}<p className="detail-author">লেখক: {p.author}</p><p className="detail-publisher">প্রকাশনী: {p.publisher}</p><div className="detail-price"><strong>{money(salePrice(p))}</strong><del>{money(p.originalPrice)}</del><span>সাশ্রয় {money(p.originalPrice - salePrice(p))}</span></div><p className={`stock-note ${availableQuantity(p) ? "" : "out-of-stock"}`}><Check size={16} />{isPreorder(p) ? `প্রি-অর্ডার · অবশিষ্ট ${bn(availableQuantity(p))} কপি` : p.stock ? `স্টকে আছে · ${bn(p.stock)} কপি` : "এই মুহূর্তে স্টক নেই"}</p><p className="detail-description">{p.description.length > 240 ? p.description.slice(0, 240) + "…" : p.description}</p>
      {isPreorder(p) && <div className="preorder-notice"><strong>আসন্ন বই · প্রি-অর্ডার</strong><p>সম্ভাব্য প্রকাশ: {dateLabel(p.preorder!.publicationDate)}<br />সম্ভাব্য পাঠানো: {dateLabel(p.preorder!.dispatchDate)}</p><p>{p.preorder!.cancellationTerms}</p></div>}
      <div className="purchase-row"><div className="quantity-control"><button aria-label="পরিমাণ কমান" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}><Minus size={16} /></button><span>{bn(quantity)}</span><button aria-label="পরিমাণ বাড়ান" disabled={quantity >= Math.min(availableQuantity(p), 20)} onClick={() => setQuantity(quantity + 1)}><Plus size={16} /></button></div><button className="button" disabled={!availableQuantity(p)} onClick={() => addToCart(p.id, quantity)}><ShoppingCart size={18} />{isPreorder(p) ? "প্রি-অর্ডার করুন" : "কার্টে যোগ করুন"}</button><button className={`button button-outline detail-wish ${wishlist.includes(p.id) ? "is-saved" : ""}`} aria-label="ইচ্ছের তালিকায় রাখুন" aria-pressed={wishlist.includes(p.id)} onClick={() => toggleWishlist(p.id)}><Heart size={20} fill={wishlist.includes(p.id) ? "currentColor" : "none"} /></button></div>
      <button className="button button-outline buy-now" disabled={!availableQuantity(p)} onClick={() => { if (addToCart(p.id, quantity)) router.push("/checkout"); }}>এখনই কিনুন <ArrowRight size={18} /></button><BookPreview productId={p.id} title={p.title} available={!!p.previewPermission && !!p.previewAssetIds?.length} />
      {!p.stock && !isPreorder(p) && <StockAlert productId={p.id} />}
      <div className="detail-assurance"><span><Truck size={18} /> ঢাকায় ৳৬০ · বাইরে ৳১২০</span><span><ShieldCheck size={18} /> ক্যাশ অন ডেলিভারি</span></div>
      <div className="book-specs">{[["ভাষা", p.language], ["পৃষ্ঠা", bn(p.pages)], ["বাঁধাই", p.binding], ["সংস্করণ", p.edition], ["অনুবাদক", p.translator], ["সম্পাদক", p.editor], ["ISBN", p.isbn], ["প্রকাশকাল", p.publicationYear ? bn(p.publicationYear) : ""]].filter(([, value]) => value).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      </div>
    </section>
    <section className="detail-tabs"><div className="tab-list" role="tablist" aria-label="বইয়ের তথ্য"><button role="tab" id="description-tab" aria-controls="book-tab-panel" aria-selected={tab === "description"} onClick={() => setTab("description")}>বই সম্পর্কে</button><button role="tab" id="contents-tab" aria-controls="book-tab-panel" aria-selected={tab === "contents"} onClick={() => setTab("contents")}>সূচিপত্র</button></div><div className="tab-panel" id="book-tab-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>{tab === "description" ? <><p>{p.description}</p>{p.sample !== false && <p className="muted small">এই পণ্যটি নমুনা। লেখক, প্রকাশনা, প্রচ্ছদ ও মূল্য প্রকৃত বিক্রির আগে যাচাই ও প্রতিস্থাপন করতে হবে।</p>}</> : <ol>{p.contents.map((c) => <li key={c}>{c}</li>)}</ol>}</div></section>
    <ProductReviews productId={p.id} />
    {related.length > 0 && <section className="related-section"><div className="section-heading"><h2>একই বিষয়ের আরও বই</h2><Link href={`/books?category=${p.category}`} className="text-link">সব দেখুন <ArrowRight size={16} /></Link></div><div className="book-grid">{related.map((r) => <BookCard key={r.id} product={r} />)}</div></section>}
  </div>;
}
