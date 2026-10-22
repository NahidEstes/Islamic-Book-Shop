"use client";
import Link from "next/link";
import { Heart, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/types";
import { bn, money } from "@/lib/catalog";
import { useStore } from "./store-provider";
import { BookCover } from "./book-cover";
import { availableQuantity, isPreorder, salePrice } from "@/lib/availability";
export function BookCard({ product }: { product: Product }) {
  const { addToCart, toggleWishlist, wishlist } = useStore();
  const saved = wishlist.includes(product.id);
  return <article className="book-card">
    <div className="book-card-art"><Link href={`/books/${product.slug}`} aria-label={`${product.title} বিস্তারিত দেখুন`}><BookCover product={product} /></Link>
      {product.originalPrice > salePrice(product) && <span className="discount-badge">−{bn(Math.round((1 - salePrice(product) / product.originalPrice) * 100))}%</span>}
      <button className={`wish-button ${saved ? "is-saved" : ""}`} aria-label={saved ? `${product.title} ইচ্ছের তালিকা থেকে সরান` : `${product.title} ইচ্ছের তালিকায় রাখুন`} aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Heart size={17} fill={saved ? "currentColor" : "none"} /></button>
    </div>
    <div className="book-card-body"><Link href={`/books/${product.slug}`}><h3>{product.title}</h3></Link><p className="book-author">{product.author}</p><span className="sample-tag">{product.sample !== false ? "নমুনা সংগ্রহ" : product.publisher}{isPreorder(product) ? " · প্রি-অর্ডার" : ""}</span>{!!product.rating?.count && <span className="rating-line">★ {bn(Number(product.rating.average.toFixed(1)))} · {bn(product.rating.count)} রিভিউ</span>}<div className="book-prices"><strong>{money(salePrice(product))}</strong><del>{money(product.originalPrice)}</del></div>
      <button className="button button-cart" disabled={availableQuantity(product) === 0} onClick={() => addToCart(product.id)}><ShoppingCart size={16} />{availableQuantity(product) > 0 ? isPreorder(product) ? "প্রি-অর্ডার করুন" : "কার্টে যোগ করুন" : "স্টক শেষ"}</button>
    </div>
  </article>;
}
