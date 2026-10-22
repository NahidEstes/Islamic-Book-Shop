import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles, BookOpen, ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
import { Collections } from "@/components/collections";
export default function Home() {
  return <>
    <section className="hero">
      <Image className="hero-photo" src="/images/bookshop-hero.png" alt="আলোকিত খিলান ও মসৃণ পাথরের টেবিলে সাজানো ইসলামিক বইয়ের সংগ্রহ" fill priority sizes="100vw" quality={90} />
      <div className="hero-shade" /><div className="container hero-inner"><div className="hero-copy"><span className="hero-kicker"><i /> ভালো বইয়ের সাথে সুন্দর পথচলা</span><h1>জ্ঞানের আলোয়<br /><em>আলোকিত হোক জীবন</em></h1><p>বিশ্বাস, জ্ঞান ও উত্তম চরিত্র গঠনের পথে<br className="desktop-break" /> আপনার বিশ্বস্ত সঙ্গী নূর বুকশপ।</p><Link className="button hero-button" href="/books">বই দেখুন <ArrowRight size={21} /></Link><div className="hero-footnote"><BookOpen size={15} /><span>আপনার পাঠের যাত্রা শুরু হোক এখানেই</span></div></div></div>
    </section>
    <Suspense><Catalog home /></Suspense>
    <Collections home />
    <section className="reading-banner container"><div className="reading-mark"><Sparkles size={27} /></div><div><span className="eyebrow">ছোটদের জন্য, ভালোবাসায় বাছাই করা</span><h2>ছোট্ট পাঠকের বড় হওয়ার সঙ্গী</h2><p>সহজ ভাষা আর সুন্দর গল্পে শুরু হোক বইয়ের সঙ্গে বন্ধুত্ব।</p></div><Link href="/books?category=children" className="button button-outline">শিশুদের বই দেখুন <ArrowUpRight size={18} /></Link><div className="banner-pattern" aria-hidden="true">✧</div></section>
  </>;
}
