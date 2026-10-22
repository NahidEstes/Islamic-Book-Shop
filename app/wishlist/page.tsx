import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
export const metadata = { title: "ইচ্ছের তালিকা" };
export default function WishlistPage() { return <div className="page-content"><Suspense><Catalog wishlistOnly /></Suspense></div>; }
