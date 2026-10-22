"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import type { Collection } from "@/lib/commerce-types";
import { api } from "@/lib/api";
import { bn } from "@/lib/catalog";
import { useStore } from "./store-provider";
import { BookCard } from "./book-card";
export function Collections({ home = false, slug }: { home?: boolean; slug?: string }) {
  const { products } = useStore(); const [collections, setCollections] = useState<Collection[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { setLoading(true); void api<{ collections: Collection[] }>("/collections").then((r) => setCollections(r.collections)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  const collection = slug && collections.find((c) => c.slug === slug); const visible = home ? collections.filter((c) => c.featured).slice(0, 3) : collections;
  if (loading) return <div className="container collection-loading muted">সংগ্রহ লোড হচ্ছে...</div>;
  if (error) return <div className="container notice" role="alert">{error}</div>;
  if (slug && !collection) return <div className="container empty-state"><h1>সংগ্রহ পাওয়া যায়নি</h1><Link href="/collections" className="button">সব সংগ্রহ দেখুন</Link></div>;
  if (collection) return <div className="container page-content collection-detail"><div className="collection-intro"><span className="eyebrow">পাঠকের জন্য বাছাই করা</span><h1>{collection.title}</h1><p>{collection.description}</p><div className="editorial-note"><Sparkles size={21} /><div><strong>এই বইগুলো কেন বেছে নেওয়া হয়েছে</strong><p>{collection.reason}</p></div></div></div><div className="book-grid">{collection.productIds.map((bookId) => products.find((p) => p.id === bookId)).filter((p) => !!p).map((p) => <BookCard product={p!} key={p!.id} />)}</div>{!collection.productIds.length && <p className="notice">এই সংগ্রহে এখনও বই যোগ করা হয়নি।</p>}</div>;
  return <section className={`container collections-section ${home ? "" : "page-content"}`}><div className="section-heading"><div><span className="eyebrow">বই বেছে নিতে একটু সহায়তা</span><h2>বিষয়ভিত্তিক নির্বাচিত সংগ্রহ</h2></div>{home && <Link className="text-link" href="/collections">সব সংগ্রহ <ArrowRight size={16} /></Link>}</div><div className="collection-grid">{visible.map((c, i) => <Link href={`/collections/${c.slug}`} className={`collection-card collection-tone-${i % 3}`} key={c.id}>{c.imageAssetId ? <img src={`/api/media/${c.imageAssetId}`} alt={c.title} loading="lazy" /> : <BookOpen size={35} strokeWidth={1.2} />}<span>{bn(c.productIds.length)}টি বইয়ের সংগ্রহ</span><h3>{c.title}</h3><p>{c.description}</p><strong>সংগ্রহ দেখুন <ArrowRight size={15} /></strong></Link>)}</div>{!visible.length && <p className="notice">সংগ্রহ প্রকাশের প্রস্তুতি চলছে।</p>}</section>;
}
