import { Collections } from "@/components/collections";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return <Collections slug={(await params).slug} />; }
