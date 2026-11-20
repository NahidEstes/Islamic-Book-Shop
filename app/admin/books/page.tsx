import { redirect } from "next/navigation";
import { AdminCatalog } from "@/components/admin-books";
import { newBookHref } from "@/lib/admin-routes";

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ new?: string | string[] }> }) {
  if ((await searchParams).new === "1") redirect(newBookHref);
  return <AdminCatalog />;
}
