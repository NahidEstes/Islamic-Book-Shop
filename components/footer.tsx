"use client";
import Link from "next/link";
import { BookOpen, ShieldCheck, Truck, Headphones, ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { useStore } from "./store-provider";
export function Footer() {
  const { demo } = useStore();
  return <>
    <section className="service-strip container" aria-label="কেনাকাটার সুবিধা">
      <div><BookOpen /><span><strong>বিষয়ভিত্তিক সংগ্রহ</strong><small>পছন্দের বই খুঁজে পাওয়া সহজ</small></span></div>
      <div><Truck /><span><strong>দোরগোড়ায় বই</strong><small>ঢাকায় ৳৬০ · বাইরে ৳১২০</small></span></div>
      <div><ShieldCheck /><span><strong>ক্যাশ অন ডেলিভারি</strong><small>বই হাতে পেয়ে মূল্য পরিশোধ</small></span></div>
      <div><Headphones /><span><strong>অর্ডারের খোঁজ রাখুন</strong><small>অর্ডার নম্বরেই দেখুন অগ্রগতি</small></span></div>
    </section>
    <footer className="site-footer"><div className="container footer-grid">
      <div className="footer-brand"><Logo light /><p>বিশ্বাস, জ্ঞান ও উত্তম চরিত্র গঠনের পথে বই হোক আপনার নিত্যসঙ্গী।</p><span className="footer-label">পড়ুন · জানুন · আলোকিত হোন</span></div>
      <div><h3>বইয়ের ভুবন</h3><Link href="/books">সব বই <ArrowUpRight size={13} /></Link><Link href="/books?category=children">শিশুদের বই</Link><Link href="/wishlist">ইচ্ছের তালিকা</Link></div>
      <div><h3>আপনার সহায়তায়</h3><Link href="/orders">অর্ডার ট্র্যাকিং</Link><Link href="/info/delivery">ডেলিভারি ও পেমেন্ট</Link><Link href="/info/returns">রিটার্ন নীতি</Link></div>
      <div><h3>নূর বুকশপ</h3><Link href="/info/about">আমাদের কথা</Link><Link href="/info/contact">যোগাযোগ</Link><Link href="/info/privacy">গোপনীয়তা ও শর্তাবলি</Link></div>
    </div><div className="container footer-bottom">
      <span>© ২০২৬ নূর বুকশপ। ভালো বই, সুন্দর জীবন।</span>
      {!demo && <span>ক্যাশ অন ডেলিভারি</span>}
      <Link href="/admin">স্টোর পরিচালনা <ArrowUpRight size={12} /></Link>
    </div><p className="container footer-credit" lang="en">Developed by Nahid Estes</p>
    </footer>
  </>;
}
