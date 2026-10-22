import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
export const metadata = { title: "বইয়ের সংগ্রহ" };
export default function BooksPage() { return <div className="page-content"><Suspense fallback={<div className="loading-line">বই লোড হচ্ছে...</div>}><Catalog /></Suspense></div>; }
