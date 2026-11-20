import type { ReactNode } from "react";
import { AdminDashboard } from "@/components/admin-dashboard";
import "./signature.css";
import "./preferences.css";

export const metadata = { title: "স্টোর পরিচালনা", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminDashboard>{children}</AdminDashboard>;
}
