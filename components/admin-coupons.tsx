"use client";
import { useState, type FormEvent } from "react";
import type { Coupon } from "@/lib/commerce-types";
import { useAdmin, useAdminResource, AdminResourceState } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import styles from "./business.module.css";
type Data = { coupons: (Coupon & { used: number })[]; products: { id: string; title: string }[] };
export function AdminCoupons() {
  const { request } = useAdmin(), { t, money, bn, dateLabel } = useAdminPreferences();
  const { data, error, reload } = useAdminResource<Data>("/coupons");
  const [editing, setEditing] = useState<Coupon | "new" | null>(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [feedback, setFeedback] = useState("");
  const [kind, setKind] = useState("percent"), [query, setQuery] = useState("");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka" }).format(new Date());
  function edit(coupon: Coupon | "new") { setEditing(coupon); setKind(coupon === "new" ? "percent" : coupon.type); setFailure(""); setFeedback(""); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; const values = new FormData(event.currentTarget); setBusy(true); setFailure("");
    const old = editing && editing !== "new" ? editing : null;
    try {
      await request(`/coupons${old ? `/${old.id}` : ""}`, { method: old ? "PUT" : "POST", body: JSON.stringify({ code: values.get("code"), type: kind, value: Number(values.get("value")), minimumMinor: Math.round(Number(values.get("minimum")) * 100), maximumMinor: values.get("maximum") ? Math.round(Number(values.get("maximum")) * 100) : undefined, starts: values.get("starts"), ends: values.get("ends"), limit: Number(values.get("limit")), productIds: values.getAll("product"), active: values.get("active") === "on", expectedVersion: old?.version }) });
      await reload(); setEditing(null); setFeedback("কুপন সংরক্ষিত হয়েছে।");
    } catch (e) { setFailure((e as Error).message); } finally { setBusy(false); }
  }
  const old = editing && editing !== "new" ? editing : null;
  const coupons = data?.coupons.filter((c) => c.code.includes(query.toUpperCase().trim())) || [];
  return <div className={styles.workspace}>
    <header className="signature-heading"><h1>{t("কুপন ও অফার")}</h1><button className="button" onClick={() => edit("new")}>{t("নতুন কুপন")}</button></header>
    <p className={styles.hint}>{t("এক অর্ডারে একটি কুপন। ছাড় শুধু বইয়ের মূল্যে; ডেলিভারি চার্জে নয়। বাতিল অর্ডারের ব্যবহারসীমা ফেরত আসে।")}</p>
    <AdminResourceState loading={!data} error={error} />
    {failure && <p className="form-error" role="alert">{t(failure)}</p>}{feedback && <p className={styles.status} role="status">{t(feedback)}</p>}
    {editing && <section className={styles.panel}><h2>{t(old ? "কুপন সম্পাদনা" : "নতুন কুপন")}</h2><form key={old?.id || "new"} className={styles.form} onSubmit={save}>
      <label>{t("কুপন কোড")}<input name="code" required pattern="[A-Za-z0-9_-]{3,30}" minLength={3} maxLength={30} defaultValue={old?.code} autoCapitalize="characters" placeholder="READ10" /></label>
      <label>{t("ছাড়ের ধরন")}<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="percent">{t("শতকরা (%)")}</option><option value="fixed">{t("নির্দিষ্ট টাকা (৳)")}</option></select></label>
      <label>{t(kind === "percent" ? "ছাড়ের শতাংশ" : "ছাড়ের টাকা (৳)")}<input name="value" required type="number" min={1} max={kind === "percent" ? 100 : 100000} step={1} defaultValue={old?.value || 10} /></label>
      <label>{t("ন্যূনতম বইয়ের মূল্য (৳)")}<input name="minimum" required type="number" min={0} max={1000000} step=".01" defaultValue={(old?.minimumMinor || 0) / 100} /></label>
      <label>{t("সর্বোচ্চ ছাড় (৳), ঐচ্ছিক")}<input name="maximum" type="number" min=".01" max={1000000} step=".01" defaultValue={old?.maximumMinor ? old.maximumMinor / 100 : ""} /></label>
      <label>{t("মোট ব্যবহারসীমা")}<input name="limit" required type="number" min={1} max={1000000} step={1} defaultValue={old?.limit || 100} /></label>
      <label>{t("শুরু")}<input name="starts" type="date" required defaultValue={old?.starts || today} /></label><label>{t("শেষ")}<input name="ends" type="date" required defaultValue={old?.ends || today} /></label>
      <fieldset className={styles.wide}><legend>{t("প্রযোজ্য বই")}</legend><p className={styles.hint}>{t("কোনো বই বাছাই না করলে সব বইয়ে প্রযোজ্য হবে।")}</p><div className={styles.checklist}>{data?.products.map((p) => <label key={p.id}><input name="product" type="checkbox" value={p.id} defaultChecked={old?.productIds.includes(p.id)} />{p.title}</label>)}</div></fieldset>
      <label><input name="active" type="checkbox" defaultChecked={old?.active ?? true} /> {t("কুপন চালু রাখুন")}</label>
      <div className={`${styles.actions} ${styles.wide}`}><button className="button" disabled={busy}>{t("কুপন সেভ করুন")}</button><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditing(null)}>{t("বন্ধ করুন")}</button></div>
    </form></section>}
    <section className={styles.panel}><label>{t("কুপন খুঁজুন")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className={styles.table} tabIndex={0}><table><thead><tr>{["কোড", "ছাড়", "মেয়াদ", "ব্যবহার", "অবস্থা", "পদক্ষেপ"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{coupons.map((c) => <tr key={c.id}><td><strong>{c.code}</strong><small>{c.productIds.length ? `${bn(c.productIds.length)} ${t("বই")}` : t("সব বই")}</small></td><td>{c.type === "percent" ? `${bn(c.value)}%` : money(c.value)}<small>{t("ন্যূনতম")} · {money(c.minimumMinor / 100)}{c.maximumMinor ? ` · ${t("সর্বোচ্চ ছাড়")} ${money(c.maximumMinor / 100)}` : ""}</small></td><td>{dateLabel(c.starts)}<small>{dateLabel(c.ends)}</small></td><td>{bn(c.used)} / {bn(c.limit)}</td><td><span className={styles.badge}>{t(!c.active ? "বন্ধ" : c.ends < today ? "মেয়াদ শেষ" : c.starts > today ? "আসন্ন" : c.used >= c.limit ? "সীমা পূর্ণ" : "চালু")}</span></td><td><button className="button button-outline" onClick={() => edit(c)}>{t("সম্পাদনা")}</button></td></tr>)}</tbody></table></div>
      {data && !coupons.length && <p className={styles.empty}>{t("কোনো কুপন পাওয়া যায়নি।")}</p>}
    </section>
  </div>;
}
