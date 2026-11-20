import { StaffInvitation } from "@/components/staff-invitation";
import "@/app/admin/signature.css";
import "@/app/admin/preferences.css";

export const metadata = { title: "Staff invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <StaffInvitation token={typeof token === "string" ? token : ""} />;
}
