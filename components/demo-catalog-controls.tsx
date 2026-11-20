"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "./store-provider";
const originalText = (value: string) => value;
export function DemoCatalogControls({ admin = false, t = originalText }: { admin?: boolean; t?: (value: string) => string }) {
  const { demoCatalog, refresh } = useStore();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (!demoCatalog) return null;
  async function reset() {
    setBusy(true); setMessage("");
    try { const { resetBrowserDemo } = await import("@/lib/browser-demo"); await resetBrowserDemo(); await refresh(); setConfirm(false); setMessage("নমুনা বইগুলো ফিরে এসেছে।"); if (admin) router.replace("/admin/books"); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <aside className={admin ? "demo-catalog-controls" : "deployment-demo-notice"}><div className={admin ? undefined : "container"}>
    <div><strong>{t("ব্রাউজারে সংরক্ষিত টেস্ট ক্যাটালগ")}</strong><p>{t("বই ও আপলোড এই ব্রাউজারে থাকবে; রিলোডেও পাওয়া যাবে। অন্য ব্রাউজার বা ডিভাইসে দেখা যাবে না। Reset বা ব্রাউজারের সাইট ডেটা মুছলে পরিবর্তন হারাবে।")}</p><p>{t("এই ডেমোতে বাস্তব অর্ডার বা অ্যাকাউন্ট সংরক্ষণ হয় না।")}</p></div>
    <div className="demo-catalog-actions">{!admin && <Link className="button button-outline" href="/admin">{t("ডেমো অ্যাডমিন")}</Link>}
      <button type="button" className="button button-outline" disabled={busy} onClick={() => { if (!confirm) { setConfirm(true); return; } void reset(); }}>{t(confirm ? "টেস্টের বই ও ফাইল মুছে Reset নিশ্চিত করুন" : "ডেমো ডেটা Reset")}</button>
      {confirm && <button type="button" className="text-link" disabled={busy} onClick={() => setConfirm(false)}>{t("ফিরে যান")}</button>}
    </div>{message && <p role="status">{t(message)}</p>}
  </div></aside>;
}
