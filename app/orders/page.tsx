import { Suspense } from "react";
import { OrderTracker } from "@/components/order-tracker";
export const metadata = { title: "অর্ডার ট্র্যাকিং" };
export default function OrdersPage() { return <Suspense><OrderTracker /></Suspense>; }
