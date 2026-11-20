import { notFound } from "next/navigation";
import { AdminSectionPage } from "@/components/admin-sections";
import { adminSections } from "@/lib/admin-routes";

export const dynamicParams = false;
export function generateStaticParams() {
  return adminSections.filter(({ slug }) => slug !== "books" && slug !== "inventory" && slug !== "reports" && slug !== "coupons").map(({ slug }) => ({ section: slug }));
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const entry = adminSections.find(({ slug }) => slug === section);
  if (!entry || entry.slug === "books" || entry.slug === "inventory" || entry.slug === "reports" || entry.slug === "coupons") notFound();
  return <AdminSectionPage section={entry} />;
}
