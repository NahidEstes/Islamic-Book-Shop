import Link from "next/link";
import { BookOpen } from "lucide-react";
export default function NotFound() { return <div className="empty-state container page-content"><BookOpen size={42} /><span className="eyebrow">৪০৪</span><h1>এই পাতাটি খুঁজে পাওয়া যায়নি</h1><p>নতুন কোনো বইয়ের পাতায় যাত্রা শুরু করুন।</p><Link href="/books" className="button">বইয়ের সংগ্রহ দেখুন</Link></div>; }
