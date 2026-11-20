import { notFound } from "next/navigation";
import { PurchaseDetails } from "@/components/inventory-purchase";
import { isBookId } from "@/lib/admin-routes";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ action?: string | string[] }> }) {
  const { id } = await params;
  const { action } = await searchParams;
  if (!isBookId(id)) notFound();
  const initialAction = action === "receive" || action === "pay" ? action : undefined;
  return <PurchaseDetails key={`${id}-${initialAction || ""}`} id={id} initialAction={initialAction} />;
}
