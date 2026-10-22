import { Suspense } from "react";
import { IdentityAction } from "@/components/customer-account";
export default function Page() { return <Suspense><IdentityAction mode="verify" /></Suspense>; }
