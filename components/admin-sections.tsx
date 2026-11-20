"use client";

import { AdminCollections } from "./admin-collections";
import { useAdmin } from "./admin-context";
import { AdminAudit, AdminFinance, AdminOutbox, AdminReturns, AdminReviews } from "./admin-operations";
import { AdminOrders } from "./admin-orders";
import { AdminStaff } from "./admin-staff";
import { useAdminPreferences } from "./admin-preferences";
import { AdminReports } from "./admin-reports";
import type { AdminSection } from "@/lib/admin-routes";

const pages = {
  orders: AdminOrders, collections: AdminCollections, reviews: AdminReviews, returns: AdminReturns,
  finance: AdminFinance, staff: AdminStaff, audit: AdminAudit, "email-queue": AdminOutbox,
};

export function AdminSectionPage({ section }: { section: Exclude<AdminSection, { slug: "books" | "inventory" | "reports" | "coupons" }> }) {
  const { t } = useAdminPreferences();
  const { permissions } = useAdmin();
  if (section.slug === "dashboard") return <AdminReports canAddBook={permissions.includes("catalog")} canOpenOrders={permissions.includes("orders")} />;
  if (section.slug === "staff") return <AdminStaff />;
  const Content = pages[section.slug];
  return <><header className="signature-heading"><h1>{t(section.label)}</h1></header><Content /></>;
}
