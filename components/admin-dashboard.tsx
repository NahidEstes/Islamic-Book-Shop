"use client";
import { useAdminPreferences, AdminPreferencesProvider, AdminPreferencesControls } from "./admin-preferences";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, ClipboardList, History, Layers3, LockKeyhole, LogOut, Mail, Menu, Package, RotateCcw, Star, Users, Wallet } from "lucide-react";
import { adminHref, adminSectionForPath, adminSections } from "@/lib/admin-routes";
import { api } from "@/lib/api";
import { roleLabels, type Asset, type Permission, type Role } from "@/lib/commerce-types";
import { AdminContext } from "./admin-context";
import { useAuth } from "./auth-provider";
import { useStore } from "./store-provider";

const icons = {
  reports: BarChart3, catalog: BookOpen, inventory: Package, orders: ClipboardList, collections: Layers3,
  reviews: Star, returns: RotateCcw, finance: Wallet, staff: Users, audit: History, notifications: Mail, promotions: Star,
};
type Access = { role: Role; permissions: Permission[] };
type VerifiedAccess = { identity: string; pathname: string; access: Access };
const authorization = (key: string): Record<string, string> => key ? { Authorization: `Bearer ${key}` } : {};

function AdminBrand() {
  const { t } = useAdminPreferences();
  return <div className="signature-brand"><BookOpen size={38} aria-hidden="true" /><strong>{t("নূর বুকশপ")}</strong><span>{t("স্টোর পরিচালনা")}</span></div>;
}

export function AdminDashboard({ children }: { children: ReactNode }) {
  return <AdminPreferencesProvider><AdminDashboardContent>{children}</AdminDashboardContent></AdminPreferencesProvider>;
}

function AdminDashboardContent({ children }: { children: ReactNode }) {
  const { t, language, theme } = useAdminPreferences();
  const { user, loading: authLoading, logout } = useAuth();
  const { refresh, readOnly } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [verified, setVerified] = useState<VerifiedAccess | null>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const ownerInput = useRef<HTMLInputElement>(null);
  const staffId = user && user.role !== "customer" ? user.id : null;
  const identity = key ? "owner-key" : staffId;
  const access = verified?.identity === identity ? verified.access : null;
  const currentAccess = verified?.pathname === pathname ? access : null;
  const selected = adminSectionForPath(pathname);
  const visible = adminSections.filter((section) => access?.permissions.includes(section.permission));
  const first = visible[0];
  const redirect = pathname === "/admin" && currentAccess && first ? adminHref(first.slug) : null;
  const checked = useRef<VerifiedAccess | null>(null);

  const request = useCallback(<T,>(path: string, options?: RequestInit) => api<T>(`/admin${path}`, {
    ...options, headers: { ...authorization(key), ...options?.headers },
  }), [key]);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!identity || (pathname !== "/admin" && !selected)) return;
    if (checked.current?.identity === identity && checked.current.pathname === pathname) return;
    let active = true;
    void request<Access>("/access").then((result) => {
      if (!active) return;
      const proof = { identity, pathname, access: result };
      checked.current = proof;
      setVerified(proof);
    }).catch((error: Error) => {
      if (!active) return;
      checked.current = null;
      setVerified(null);
      setKey("");
      setError(error.message);
    });
    return () => { active = false; };
  }, [identity, pathname, request, selected]);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  async function authenticate(ownerKey: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Access>("/admin/access", { headers: authorization(ownerKey) });
      const proof = { identity: "owner-key", pathname, access: result };
      checked.current = proof;
      setKey(ownerKey);
      setVerified(proof);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      if (staffId) await logout();
      checked.current = null;
      setKey("");
      setVerified(null);
      setMenuPath(null);
      setNotice("");
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  const run = useCallback(async (action: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError("");
    try { await action(); await refresh(); if (message) setNotice(message); }
    catch (error) { setError((error as Error).message); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { setBusy(false); }
  }, [refresh]);

  const upload = useCallback(async (file: File, kind: Asset["kind"], productId?: string) => {
    if (file.size > 10 * 1024 * 1024) throw new Error("ফাইল সর্বোচ্চ ১০ মেগাবাইট হতে পারে");
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    if (productId) body.append("productId", productId);
    const response = await fetch(kind === "receipt" ? "/api/admin/inventory/receipts" : "/api/admin/media", { method: "POST", body, headers: authorization(key) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "ফাইল আপলোড হয়নি");
    return data.asset as Asset;
  }, [key]);

  const skipLink = <a href="#admin-content" className="skip-link">{t("মূল কনটেন্টে যান")}</a>;
  if (readOnly) return <div className="noor-admin signature-entry" lang={language} data-theme={theme}><div className="signature-entry-brand"><AdminBrand /></div><div className="signature-entry-main"><AdminPreferencesControls /><section className="panel signature-login"><h1>{t("নমুনা বইয়ের ডেমো")}</h1><p>{t("এই ডেমোতে অ্যাডমিন থেকে বই যোগ বা তথ্য সংরক্ষণ চালু নেই। স্থায়ী পরিবর্তনের জন্য API ও ডেটাবেস সংযোগ প্রয়োজন।")}</p><Link className="button" href="/books">{t("বইয়ের দোকানে ফিরুন")}</Link></section></div></div>;
  if (!selected && pathname !== "/admin") return children;
  if (!access) return (
    <div className="noor-admin signature-entry" lang={language} data-theme={theme}>
      {skipLink}
      <div className="signature-entry-brand"><AdminBrand /><Link href="/"><ArrowLeft size={17} />{" " + t("বইয়ের দোকানে ফিরুন")}</Link></div>
      <div className="signature-entry-main" id="admin-content" tabIndex={-1}>
        <AdminPreferencesControls />
        <form className="panel signature-login" method="post" onSubmit={(event) => {
          event.preventDefault();
          const input = ownerInput.current?.value.trim();
          if (input) void authenticate(input);
        }}>
          <span className="signature-icon"><LockKeyhole size={23} /></span>
          <h1>{t("অ্যাডমিন প্যানেল")}</h1>
          <p>{t("স্টোর পরিচালনা করতে মালিকের কী ব্যবহার করুন। কর্মীরা তাঁদের অ্যাকাউন্ট দিয়ে প্রবেশ করতে পারবেন।")}</p>
          <label>{t("প্রাথমিক মালিকের কী")}<input ref={ownerInput} type="password" autoComplete="off" disabled={!ready || authLoading} required placeholder={t("শুধু প্রাথমিক মালিকের জন্য")} /></label>
          {error && <p className="form-error" role="alert">{t(error)}</p>}
          <button className="button full-width" disabled={!ready || authLoading || busy}>{busy ? t("যাচাই হচ্ছে...") : t("প্রবেশ করুন")}</button>
          <Link href={{ pathname: "/account", query: { next: pathname } }} className="text-link">{t("কর্মীর অ্যাকাউন্টে লগইন করুন →")}</Link>
        </form>
      </div>
    </div>
  );

  const menuOpen = menuPath === pathname;
  const allowed = selected && currentAccess?.permissions.includes(selected.permission);

  return (
    <AdminContext.Provider value={{ request, run, upload, busy, setError, permissions: access.permissions }}>
      <div className="noor-admin signature-shell" lang={language} data-theme={theme}>
        {skipLink}
        <aside className="signature-sidebar">
          <div className="signature-sidebar-top">
            <AdminBrand />
            <button type="button" className="signature-menu" aria-expanded={menuOpen} aria-controls="signature-nav" onClick={() => setMenuPath(menuOpen ? null : pathname)}><Menu size={20} />{" " + t("মেনু")}</button>
          </div>
          <div className={`signature-sidebar-body${menuOpen ? " is-open" : ""}`} id="signature-nav">
            <nav aria-label={t("স্টোর পরিচালনার বিভাগ")}>
              {visible.map(({ slug, permission, label }) => {
                const Icon = icons[permission];
                return <Link key={slug} href={adminHref(slug)} aria-current={selected?.slug === slug ? "page" : undefined} onNavigate={() => { setMenuPath(null); setError(""); }}><Icon size={19} aria-hidden="true" />{t(label)}</Link>;
              })}
            </nav>
            <div className="signature-sidebar-foot">
              <span>{t(roleLabels[access.role])}</span>
              <Link href="/"><ArrowLeft size={16} />{" " + t("দোকানে ফিরুন")}</Link>
              <button type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16} />{" " + t("লগআউট")}</button>
            </div>
          </div>
        </aside>
        <div className="signature-main" id="admin-content" tabIndex={-1}>
          <div className="signature-preferences-bar"><AdminPreferencesControls /></div>
          {error && <p className="form-error signature-error" role="alert">{t(error)}</p>}
          {notice && <p className="toast signature-toast" role="status"><CheckCircle2 size={19} aria-hidden="true" />{notice}</p>}
          <section className="admin-workspace signature-workspace" aria-busy={busy || !currentAccess || Boolean(redirect)}>
            {!currentAccess || redirect ? <p className="muted" role="status">{t("যাচাই হচ্ছে...")}</p> : allowed ? children : (
              <div className="panel empty-state">
                <LockKeyhole size={32} aria-hidden="true" />
                <h1>{t("এই বিভাগে প্রবেশের অনুমতি নেই")}</h1>
                <p>{t("আপনার ভূমিকা থেকে এই বিভাগ দেখা যাবে না।")}</p>
                {first && <Link href={adminHref(first.slug)} className="button">{t(first.label)}</Link>}
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
