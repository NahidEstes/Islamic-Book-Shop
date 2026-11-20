import { NewPurchase } from "@/components/inventory-purchase";
export default async function Page({ searchParams }: { searchParams: Promise<{ book?: string | string[] }> }) {
  const { book } = await searchParams;
  return <NewPurchase selectedBook={typeof book === "string" ? book : ""} />;
}
