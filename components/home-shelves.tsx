"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useStore } from "./store-provider";
import { BookCard } from "./book-card";
import { availableQuantity, salePrice } from "@/lib/availability";
export function HomeShelves() {
  const { products, loading } = useStore();
  if (loading) return null;
  const recent = products.slice(-4).reverse();
  const offers = products.filter((p) => availableQuantity(p) > 0 && p.originalPrice > salePrice(p)).sort((a, b) => (1 - salePrice(b) / b.originalPrice) - (1 - salePrice(a) / a.originalPrice)).slice(0, 4);
  return <>{[{ title: "নতুন সংযোজন", description: "সদ্য যোগ হওয়া বইগুলো দেখে নিন", books: recent, href: "/books?sort=newest" }, { title: "সাশ্রয়ে পছন্দের বই", description: "বর্তমান মূল্য ও ছাড় একসঙ্গে দেখে বেছে নিন", books: offers, href: "/books?discount=true" }].filter((shelf) => shelf.books.length).map((shelf) => <section className="container storefront-shelf" key={shelf.title}><div className="section-heading"><div><span className="eyebrow">{shelf.description}</span><h2>{shelf.title}</h2></div><Link className="text-link" href={shelf.href}>সব দেখুন <ArrowRight size={16} /></Link></div><div className="book-grid">{shelf.books.map((p) => <BookCard key={p.id} product={p} />)}</div></section>)}</>;
}
