"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, Menu, Search, ShoppingCart, UserRound, X, ChevronDown, Truck, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, Suspense } from "react";
import { useStore } from "./store-provider";
import { Logo } from "./logo";
import { bn } from "@/lib/catalog";
import { useAuth } from "./auth-provider";

function HeaderContent() {
  const { count, wishlist, products } = useStore();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBox = useRef<HTMLFormElement>(null);
  const suggestions = query.trim().length >= 2 ? products.filter((p) => `${p.title} ${p.author} ${p.isbn || ""}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : [];
  useEffect(() => { function outside(event: PointerEvent) { if (!searchBox.current?.contains(event.target as Node)) setSearchOpen(false); } document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, []);
  useEffect(() => { setMenu(false); setQuery(params.get("q") || ""); }, [pathname, params]);
  return <>
    <div className="announcement"><div className="container announcement-inner"><span>বইয়ের পাতায় খুঁজে নিন আলোকিত জীবনের পথ</span><Link href="/info/delivery"><Truck size={14} /> ডেলিভারি তথ্য <ArrowUpRight size={13} /></Link></div></div>
    <header className="site-header">
      <div className="container header-main">
        <button className="mobile-menu icon-button" aria-label="মেনু খুলুন" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        <Logo light />
        <form ref={searchBox} className="search-form" role="search" onSubmit={(e) => { e.preventDefault(); setSearchOpen(false); router.push(`/books${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); }} onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); if (e.key === "ArrowDown" && e.target instanceof HTMLInputElement && suggestions.length) { e.preventDefault(); searchBox.current?.querySelector<HTMLAnchorElement>(".search-suggestions a")?.focus(); } }}>
          <Search size={21} /><input type="search" aria-label="বই বা লেখকের নাম" aria-controls={searchOpen && suggestions.length ? "quick-book-search" : undefined} placeholder="বই, লেখক বা ISBN দিয়ে খুঁজুন…" value={query} onFocus={() => setSearchOpen(true)} onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }} /><button type="submit">খুঁজুন <span className="search-key">↵</span></button>
          {searchOpen && suggestions.length > 0 && <div id="quick-book-search" className="search-suggestions" role="region" aria-label="দ্রুত অনুসন্ধানের ফল"><ul>{suggestions.map((p) => <li key={p.id}><Link href={`/books/${p.slug}`} onClick={() => setSearchOpen(false)}><strong>{p.title}</strong><small>{p.author}</small></Link></li>)}</ul><Link href={`/books?q=${encodeURIComponent(query.trim())}`} onClick={() => setSearchOpen(false)}>সব ফলাফল দেখুন →</Link></div>}
        </form>
        <div className="header-actions">
          <Link href="/account" className="header-action" aria-label="পাঠকের অ্যাকাউন্ট"><UserRound /><span>{user ? "আমার অ্যাকাউন্ট" : "লগইন / নিবন্ধন"}</span></Link>
          <Link href="/wishlist" className="header-action wishlist-action" aria-label={`ইচ্ছের তালিকা, ${bn(wishlist.length)}টি বই`}><span className="header-icon"><Heart />{wishlist.length > 0 && <i>{bn(wishlist.length)}</i>}</span><span>ইচ্ছের তালিকা</span></Link>
          <Link href="/cart" className="header-action" aria-label={`কার্ট, ${bn(count)}টি বই`}><span className="header-icon"><ShoppingCart /><i>{bn(count)}</i></span><span>কার্ট</span></Link>
        </div>
      </div>
      <nav className={`main-nav ${menu ? "menu-open" : ""}`} aria-label="প্রধান মেনু"><div className="container nav-inner">
        <Link href="/books?category=tafsir">তাফসির <ChevronDown size={13} /></Link>
        <Link href="/books?category=hadith">হাদিস <ChevronDown size={13} /></Link>
        <Link href="/books?category=seerah">সীরাত <ChevronDown size={13} /></Link>
        <Link href="/books?category=children">শিশুদের বই <ChevronDown size={13} /></Link>
        <span className="nav-divider" />
        <Link href="/books?sort=newest">নতুন বই</Link><Link href="/collections">নির্বাচিত সংগ্রহ</Link><Link href="/books">সব বই</Link><Link href="/account">পাঠকের অ্যাকাউন্ট</Link><Link href="/orders" className="nav-track">অর্ডার ট্র্যাক করুন <ArrowUpRight size={14} /></Link>
      </div></nav>
    </header>
  </>;
}
export function Header() { return <Suspense fallback={<div className="header-placeholder" />}><HeaderContent /></Suspense>; }
