"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "./store-provider";
import { useAuth } from "./auth-provider";
import { AdminContext, type AdminContextType } from "./admin-context";
import { AdminCatalog } from "./admin-catalog";
import { AdminCollections } from "./admin-collections";
import { AdminReports, AdminOrders, AdminReviews, AdminReturns, AdminFinance, AdminStaff, AdminAudit, AdminOutbox } from "./admin-operations";
import { roleLabels, type Asset, type Permission, type Role } from "@/lib/commerce-types";

const sections: { permission: Permission; label: string; Component: () => React.ReactNode }[] = [
  { permission: "reports", label: "বিক্রির হিসাব", Component: AdminReports }, { permission: "catalog", label: "বই ও প্রিভিউ", Component: AdminCatalog }, { permission: "orders", label: "অর্ডার ও প্রি-অর্ডার", Component: AdminOrders }, { permission: "collections", label: "নির্বাচিত সংগ্রহ", Component: AdminCollections }, { permission: "reviews", label: "রিভিউ", Component: AdminReviews }, { permission: "returns", label: "রিটার্ন", Component: AdminReturns }, { permission: "finance", label: "পেমেন্ট ও রিফান্ড", Component: AdminFinance }, { permission: "staff", label: "কর্মী ও অনুমতি", Component: AdminStaff }, { permission: "audit", label: "পরিবর্তনের লগ", Component: AdminAudit }, { permission: "notifications", label: "ইমেইল কিউ", Component: AdminOutbox },
];
export function AdminDashboard() {
  const { user, logout } = useAuth(); const { refresh, notify } = useStore(); const [key, setKey] = useState(""); const [authenticated, setAuthenticated] = useState(false); const [access, setAccess] = useState<{ role: Role; permissions: Permission[] } | null>(null); const [tab, setTab] = useState<Permission>("reports"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const headers = useMemo(() => { const value: Record<string, string> = {}; if (key) value.Authorization = `Bearer ${key}`; return value; }, [key]);
  const request = useCallback(<T,>(path: string, options?: RequestInit) => api<T>(`/admin${path}`, { ...options, headers: { ...headers, ...options?.headers } }), [headers]);
  async function authenticate() { setBusy(true); setError(""); try { const a = await request<{ role: Role; permissions: Permission[] }>("/access"); setAccess(a); setTab(a.permissions.includes("reports") ? "reports" : a.permissions[0]); setAuthenticated(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(() => { if (user && user.role !== "customer") void authenticate(); }, [user?.id]);
  const run = useCallback(async (fn: () => Promise<unknown>, message?: string) => { setBusy(true); setError(""); try { await fn(); await refresh(); if (message) notify(message); } catch (e) { setError((e as Error).message); window.scrollTo({ top: 170, behavior: "smooth" }); } finally { setBusy(false); } }, [notify, refresh]);
  const upload = useCallback(async (file: File, kind: Asset["kind"], productId?: string) => {
    if (file.size > 10 * 1024 * 1024) throw new Error("ফাইল সর্বোচ্চ ১০ মেগাবাইট হতে পারে"); const body = new FormData(); body.append("file", file); body.append("kind", kind); if (productId) body.append("productId", productId);
    const response = await fetch("/api/admin/media", { method: "POST", body, headers }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "ফাইল আপলোড হয়নি"); return data.asset as Asset;
  }, [headers]);
  const context: AdminContextType = { request, run, upload, busy, setError };
  if (!authenticated) return <div className="container page-content admin-page"><form className="panel admin-login" onSubmit={(e) => { e.preventDefault(); void authenticate(); }}><LockKeyhole size={35} /><span className="eyebrow">স্টোর পরিচালনা</span><h1>অ্যাডমিন প্যানেল</h1><p>কর্মীরা পাঠকের অ্যাকাউন্ট দিয়ে লগইন করে অনুমতি অনুযায়ী কাজ করতে পারবেন। প্রাথমিক মালিক .env.local-এর ADMIN_API_KEY ব্যবহার করতে পারবেন।</p><label>প্রাথমিক মালিকের কী<input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="শুধু প্রাথমিক মালিকের জন্য" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button full-width" disabled={busy}>{busy ? "যাচাই হচ্ছে..." : "প্রবেশ করুন"}</button><a href="/account" className="text-link forgot-link">কর্মীর অ্যাকাউন্টে লগইন করুন →</a></form></div>;
  const visible = sections.filter((s) => access?.permissions.includes(s.permission)); const selected = visible.find((s) => s.permission === tab) || visible[0];
  return <AdminContext.Provider value={context}><div className="container page-content admin-page"><div className="admin-top"><div className="page-heading"><span className="eyebrow">নূর বুকশপ · {access ? roleLabels[access.role] : ""}</span><h1>স্টোর পরিচালনা</h1><p><ShieldCheck size={14} /> আপনার ভূমিকায় অনুমোদিত কাজগুলো এখানে পাওয়া যাবে।</p></div><button className="button button-outline" disabled={busy} onClick={() => { setKey(""); setAuthenticated(false); setAccess(null); setError(""); if (user && user.role !== "customer") void logout(); }}><LogOut size={16} /> লগআউট</button></div><nav className="admin-workspace-nav" aria-label="স্টোর পরিচালনার বিভাগ">{visible.map((s) => <button key={s.permission} className={s.permission === selected?.permission ? "active" : ""} onClick={() => { setTab(s.permission); setError(""); }}>{s.label}</button>)}</nav>{error && <div className="form-error" role="alert">{error}</div>}<section className="admin-workspace" aria-busy={busy} key={selected?.permission}>{selected && <selected.Component />}</section></div></AdminContext.Provider>;
}
