import { notFound } from "next/navigation";
import { AdminEditBook } from "@/components/admin-catalog";
import { isBookId } from "@/lib/admin-routes";

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isBookId(id)) notFound();
  return <AdminEditBook key={id} id={id} />;
}
