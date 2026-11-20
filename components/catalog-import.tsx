"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { makeCsv } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { useAdmin } from "./admin-context";
import { useStore } from "./store-provider";
import { useAdminPreferences } from "./admin-preferences";
import styles from "./business.module.css";
type Preview = { valid: boolean; fingerprint: string; creates: number; updates: number; rows: { row: number; title: string; action: string; price?: number; stock?: number; error: string }[] };
export function CatalogImport() {
  const { request } = useAdmin(), { refresh } = useStore(), { t, bn, money } = useAdminPreferences();
  const [csv, setCsv] = useState(""), [filename, setFilename] = useState(""), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false); const token = useRef<string | null>(null);
  async function check() {
    setBusy(true); setError(""); setPreview(null); setConfirmed(false);
    try { setPreview(await request<Preview>("/catalog/import/preview", { method: "POST", body: JSON.stringify({ csv }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview?.valid || !confirmed || busy) return; setBusy(true); setError(""); token.current ??= crypto.randomUUID();
    try { const { batch } = await request<{ batch: { count: number } }>("/catalog/import/commit", { method: "POST", body: JSON.stringify({ csv, fingerprint: preview.fingerprint, requestId: token.current }) }); setMessage(`${t("বই সংরক্ষিত হয়েছে")} · ${bn(batch.count)}`); setPreview(null); setCsv(""); setFilename(""); token.current = null; void refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportAll() { setBusy(true); setError(""); try { const data = await request<{ csv: string }>("/catalog/export"); downloadText(data.csv, "noor-books.csv"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function template() { downloadText(makeCsv([["id", "slug", "title", "author", "publisher", "category", "price", "originalPrice", "stock", "pages", "language", "edition", "binding", "featured", "coverTheme", "description", "sample"], ["", "example-book", "নমুনা বইয়ের নাম", "নমুনা লেখক", "নমুনা প্রকাশনী", "life", 250, 300, 0, 160, "বাংলা", "প্রথম", "পেপারব্যাক", false, "sage", "বইয়ের পরিচিতি এখানে লিখুন।", true]]), "noor-books-template.csv"); }
  return <div className={styles.workspace}>
    <header className="signature-heading"><h1>{t("বই import ও export")}</h1><Link href="/admin/books" className="button button-outline">{t("বইয়ের তালিকায় ফিরুন")}</Link></header>
    <section className={styles.panel}><h2>{t("একসঙ্গে অনেক বই যোগ বা আপডেট")}</h2><p className={styles.hint}>{t("UTF-8 CSV ব্যবহার করুন। নতুন বইয়ের id খালি রাখুন; আপডেটের জন্য export করা id দিন। শুধু ফাইলে থাকা কলাম বদলাবে। প্রচ্ছদ, প্রিভিউ ও প্রি-অর্ডার এখানে পরিবর্তন হয় না।")}</p><p className={styles.warning}>{t("স্টক পরিবর্তন করলে সেটি বর্তমান স্টক প্রতিস্থাপন করবে। অতিরিক্ত কেনা বই Inventory থেকে গ্রহণ করুন। নতুন অজানা কপির ক্রয়মূল্য পরে Reports থেকে যোগ করা যাবে।")}</p>
      <div className={styles.actions}><button className="button button-outline" onClick={template}>{t("CSV টেমপ্লেট")}</button><button className="button button-outline" disabled={busy} onClick={() => void exportAll()}>{t("সব বই export করুন")}</button></div>
      <label>{t("CSV ফাইল")}<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; setPreview(null); setMessage(""); setError(""); setCsv(""); setConfirmed(false); token.current = null; if (!file) return; setFilename(file.name); if (file.size > 512000) { setError("CSV ফাইল সর্বোচ্চ ৫০০ KB হতে পারবে।"); return; } try { setCsv(await file.text()); } catch { setError("ফাইলটি পড়া যায়নি।"); } }} /></label>
      <p className={styles.hint}>{filename} · {t("সর্বোচ্চ ৫০০ সারি ও ৫০০ KB।")}</p><div className={styles.actions}><button className="button" disabled={!csv || busy} onClick={() => void check()}>{t("পরিবর্তনের প্রিভিউ দেখুন")}</button></div>
      <details><summary>{t("কলামের নির্দেশনা")}</summary><p className={styles.hint}>category: tafsir, hadith, seerah, aqidah, life, children, dua. coverTheme: sage, sand, emerald, sky, navy, clay. featured / sample: true / false. tags / contents: | {t("দিয়ে আলাদা করুন।")}</p><p className={styles.hint}>{t("নতুন বইয়ে title, slug, author, publisher, category, price, originalPrice ও description প্রয়োজন। টাকা পূর্ণ সংখ্যায় দিন।")}</p></details>
    </section>
    {error && <p className="form-error" role="alert">{t(error)}</p>}{message && <p className={styles.status} role="status">{message}</p>}
    {preview && <section className={styles.panel}><h2>{t("আমদানির প্রিভিউ")}</h2><p>{t("নতুন")} · {bn(preview.creates)} / {t("আপডেট")} · {bn(preview.updates)} / {t("ভুল সারি")} · {bn(preview.rows.filter((r) => r.error).length)}</p>
      <div className={styles.table} tabIndex={0}><table><thead><tr>{["সারি", "বই", "পদক্ষেপ", "দাম / স্টক", "যাচাই"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{preview.rows.map((r) => <tr key={r.row}><td>{bn(r.row)}</td><td>{r.title || "—"}</td><td>{t(r.action === "create" ? "নতুন" : "আপডেট")}</td><td>{r.price === undefined ? "—" : `${money(r.price)} / ${bn(r.stock || 0)}`}</td><td className={r.error ? styles.negative : ""}>{r.error ? t(r.error) : t("সঠিক")}</td></tr>)}</tbody></table></div>
      {preview.valid ? <><label className={styles.warning}><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("প্রিভিউ ও স্টকের পরিবর্তন পর্যালোচনা করেছি; এই তথ্য সেভ করতে চাই।")}</label><button className="button" disabled={!confirmed || busy} onClick={() => void commit()}>{t("সব সারি সেভ করুন")}</button></> : <p className={styles.warning}>{t("ভুল সারি থাকলে কোনো পরিবর্তন সেভ হবে না। ফাইল ঠিক করে আবার প্রিভিউ দেখুন।")}</p>}
    </section>}
  </div>;
}
