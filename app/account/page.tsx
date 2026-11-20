import { CustomerAccount } from "@/components/customer-account";
import { Suspense } from "react";
export const metadata = { title: "পাঠকের অ্যাকাউন্ট" };
export default function Page() { return <Suspense fallback={<div className="container loading-line">অ্যাকাউন্ট লোড হচ্ছে...</div>}><CustomerAccount /></Suspense>; }
