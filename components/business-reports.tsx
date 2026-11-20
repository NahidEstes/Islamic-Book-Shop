"use client";
import { useRef, useState, type FormEvent } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import type { BusinessReport } from "@/lib/business-report";
import { inventoryPeriodRange } from "@/lib/inventory-overview";
import { makeCsv } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { useAdmin, useAdminResource, AdminResourceState } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import styles from "./business.module.css";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka" }).format(new Date());
const expenseNames = { packaging: "প্যাকেজিং", courier: "কুরিয়ার", rent: "ভাড়া", other: "অন্যান্য" };
export function BusinessReports() {
  const { request, permissions } = useAdmin();
  const { t, money, bn, dateLabel } = useAdminPreferences();
  const [range, setRange] = useState(() => inventoryPeriodRange("month", today()));
  const params = new URLSearchParams(); if (range.from) params.set("from", range.from); if (range.to) params.set("to", range.to);
  const { data, error, reload } = useAdminResource<BusinessReport>(`/reports?${params}`);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [failure, setFailure] = useState("");
  const [showExpense, setShowExpense] = useState(false), [bookFilter, setBookFilter] = useState("all"), [voidId, setVoidId] = useState("");
  const token = useRef<string | null>(null);
  async function perform(action: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true); setFailure(""); setFeedback("");
    try { await action(); await reload(); token.current = null; setFeedback(message); return true; }
    catch (e) { setFailure((e as Error).message); return false; } finally { setBusy(false); }
  }
  function selectRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const from = String(values.get("from") || ""), to = String(values.get("to") || "");
    if (from && to && from > to) { setFailure("শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।"); return; }
    setFailure(""); setRange({ from, to });
  }
  async function expense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); token.current ??= crypto.randomUUID();
    if (await perform(() => request("/reports/expenses", { method: "POST", body: JSON.stringify({ date: values.get("date"), category: values.get("category"), amountMinor: Math.round(Number(values.get("amount")) * 100), reference: values.get("reference"), note: values.get("note"), requestId: token.current }) }), "খরচ রেকর্ড হয়েছে।")) setShowExpense(false);
  }
  async function openingCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form); const book = data!.books.find((b) => b.id === values.get("book"))!; token.current ??= crypto.randomUUID();
    if (await perform(() => request(`/inventory/products/${book.id}/opening-cost`, { method: "PUT", body: JSON.stringify({ unitCostMinor: Math.round(Number(values.get("cost")) * 100), expectedStock: book.stock, expectedKnown: book.stock - book.unknownStock, requestId: token.current }) }), "বর্তমান অজানা কপির ক্রয়মূল্য সংরক্ষিত হয়েছে।")) form.reset();
  }
  function exportReport() {
    if (!data) return;
    downloadText(makeCsv([["Report", range.from, range.to], ["Book net sales", data.revenueMinor / 100], ["Delivery revenue", data.deliveryMinor / 100], ["Known COGS", data.costMinor / 100], ["Expenses", data.expensesMinor / 100], ["Result", data.resultMinor === null ? "Unknown costs" : data.resultMinor / 100], ["Unknown cost copies", data.unknownQuantity], ["Current customer dues", data.customerDuesMinor / 100], ["Current supplier dues", data.supplierDuesMinor / 100], [], ["Book", "Sold", "Returned", "Net sales", "Known cost", "Unknown cost copies", "Stock", "Known stock value", "Unknown stock"], ...data.books.map((b) => [b.title, b.sold, b.returned, b.revenueMinor / 100, b.costMinor / 100, b.unknownQuantity, b.stock, b.stockValueMinor / 100, b.unknownStock]), [], ["Expense date", "Category", "Amount", "Reference", "Note"], ...data.expenses.map((e) => [e.date, e.category, e.amountMinor / 100, e.reference, e.note])]), `noor-report-${range.from || "all"}-${range.to || "all"}.csv`);
  }
  const books = data?.books.filter((b) => bookFilter === "unknown" ? b.unknownStock || b.unknownQuantity : bookFilter === "slow" ? b.stock > 0 && b.sold - b.returned <= 0 : true) || [];
  const max = Math.max(1, ...(data?.months || []).flatMap((m) => [Math.abs(m.revenueMinor), m.expensesMinor]));
  return <div className={styles.workspace}>
    <header className="signature-heading"><h1>{t("লাভ ও ব্যবসার রিপোর্ট")}</h1><div className={styles.actions}><button className="button button-outline" disabled={!data} onClick={exportReport}><Download size={17} />{t("CSV ডাউনলোড")}</button><button className="button button-outline" onClick={() => window.print()}><Printer size={17} />{t("প্রিন্ট")}</button></div></header>
    <div className={styles.actions}>{[["today", "আজ"], ["month", "এই মাস"], ["last-month", "গত মাস"], ["all", "সব সময়"]].map(([value, label]) => <button className="button button-outline" key={value} onClick={() => setRange(inventoryPeriodRange(value as "today" | "month" | "last-month" | "all", today()))}>{t(label)}</button>)}</div>
    <form className={styles.toolbar} onSubmit={selectRange} key={`${range.from}-${range.to}`}><label>{t("শুরুর তারিখ")}<input type="date" name="from" defaultValue={range.from} /></label><label>{t("শেষের তারিখ")}<input type="date" name="to" defaultValue={range.to} /></label><button className="button">{t("হিসাব দেখুন")}</button></form>
    <AdminResourceState loading={!data} error={error} />
    <p className={styles.printOnly}>{t("রিপোর্টের সময়সীমা")} · {range.from ? dateLabel(range.from) : t("সব সময়")} — {range.to ? dateLabel(range.to) : t("আজ")}</p>
    {failure && <p className="form-error" role="alert">{t(failure)}</p>}{feedback && <p className={styles.status} role="status">{t(feedback)}</p>}
    {data && <>
      <p className={styles.hint}>{t("বিক্রির তারিখ ডেলিভারির দিন; রিটার্নের তারিখ হাতে পাওয়ার দিন। আদায় ও রিফান্ড আলাদা নগদ হিসাব। বকেয়া ও স্টক বর্তমান অবস্থার।")}</p>
      <dl className={styles.metrics}>{[["বইয়ের নিট বিক্রি", data.revenueMinor], ["জানা ক্রয়খরচ", data.costMinor], ["নথিভুক্ত খরচ", data.expensesMinor], ["নথিভুক্ত হিসাবের ফল", data.resultMinor]].map(([label, value]) => <div key={label}><dt>{t(String(label))}</dt><dd>{value === null ? t("অসম্পূর্ণ") : money(Number(value) / 100)}</dd></div>)}</dl>
      {data.unknownQuantity > 0 && <p className={styles.warning}>{t("ক্রয়মূল্য অজানা কপি")} · {bn(data.unknownQuantity)}. {t("ক্রয়মূল্য অসম্পূর্ণ থাকায় মোট লাভ দেখানো হয়নি।")}</p>}
      {data.legacyDates > 0 && <p className={styles.warning}>{t("পুরোনো রেকর্ডে ডেলিভারি বা রিটার্ন গ্রহণের তারিখ নেই; তৈরির তারিখ ব্যবহার হয়েছে।")} · {bn(data.legacyDates)}</p>}
      <p className={styles.hint}>{t("ক্রয়মূল্য জানা কপির চলমান গড় খরচ বিক্রির সময় সংরক্ষিত হয়। অজানা পুরোনো কপির খরচ অনুমান করা হয় না। নথিভুক্ত নয় এমন খরচ এই ফলে অন্তর্ভুক্ত নয়।")}</p>
      <dl className={styles.metrics}>{[["গ্রাহকের কাছে বর্তমান পাওনা", data.customerDuesMinor], ["সরবরাহকারীর বর্তমান বকেয়া", data.supplierDuesMinor], ["নির্বাচিত সময়ে আদায়", data.collectedMinor], ["নির্বাচিত সময়ে রিফান্ড", data.refundedMinor], ["স্টকের জানা ক্রয়মূল্য", data.inventoryValueMinor], ["ডেলিভারি আয়", data.deliveryMinor], ["বইয়ের স্থূল লাভ", data.grossProfitMinor]].map(([label, value]) => <div key={label}><dt>{t(String(label))}</dt><dd>{value === null ? t("অসম্পূর্ণ") : money(Number(value) / 100)}</dd></div>)}</dl>
      {data.unknownStock > 0 && <p className={styles.warning}>{t("স্টকে ক্রয়মূল্য অজানা কপি")} · {bn(data.unknownStock)}</p>}<section className={styles.panel}><h2><BarChart3 size={20} /> {t("মাসভিত্তিক বিক্রি ও খরচ")}</h2><p className={styles.hint}>{t("সবুজ: বইয়ের নিট বিক্রি · সোনালি: নথিভুক্ত খরচ")}</p><div className={styles.chart}>{data.months.map((m) => <div className={styles.chartRow} key={m.month}><span>{m.month}</span><div aria-hidden="true"><i className={styles.bar} style={{ width: `${Math.abs(m.revenueMinor) / max * 100}%` }} /><i className={`${styles.bar} ${styles.costBar}`} style={{ width: `${m.expensesMinor / max * 100}%` }} /></div><span>{money(m.revenueMinor / 100)} / {money(m.expensesMinor / 100)}</span></div>)}</div>{!data.months.length && <p className={styles.empty}>{t("এই সময়ে কোনো রেকর্ড নেই।")}</p>}</section>
      <section className={styles.panel}><h2>{t("বইভিত্তিক ব্যবসার হিসাব")}</h2><label>{t("বইয়ের তালিকা")}<select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)}><option value="all">{t("বেশি বিক্রি আগে")}</option><option value="slow">{t("নির্বাচিত সময়ে বিক্রি হয়নি")}</option><option value="unknown">{t("ক্রয়মূল্য অজানা")}</option></select></label><div className={styles.table} tabIndex={0} role="region" aria-label={t("বইভিত্তিক ব্যবসার হিসাব")}><table><thead><tr>{["বই", "বিক্রি / রিটার্ন", "নিট বিক্রি", "জানা ক্রয়খরচ", "স্থূল লাভ", "স্টক / অজানা খরচ"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{books.map((b) => <tr key={b.id}><td>{b.title}</td><td>{bn(b.sold)} / {bn(b.returned)}</td><td>{money(b.revenueMinor / 100)}</td><td>{money(b.costMinor / 100)}</td><td>{b.unknownQuantity ? t("অসম্পূর্ণ") : money((b.revenueMinor - b.costMinor) / 100)}</td><td>{bn(b.stock)} / {bn(b.unknownStock)}</td></tr>)}</tbody></table></div>{!books.length && <p className={styles.empty}>{t("কোনো বই পাওয়া যায়নি।")}</p>}</section>
      {permissions.includes("inventory") && <section className={`${styles.panel} ${styles.noPrint}`}><h2>{t("পুরোনো স্টকের ক্রয়মূল্য যোগ করুন")}</h2><p className={styles.hint}>{t("শুধু বর্তমানে ক্রয়মূল্য অজানা কপিতে প্রযোজ্য। পুরোনো বিক্রির হিসাব বদলাবে না।")}</p>{data.unknownStock ? <form className={styles.toolbar} onSubmit={openingCost} onChange={() => { token.current = null; }}><label>{t("বই")}<select name="book" required>{data.books.filter((b) => b.unknownStock > 0).map((b) => <option value={b.id} key={b.id}>{b.title} · {bn(b.unknownStock)} {t("কপি")}</option>)}</select></label><label>{t("প্রতি কপির ক্রয়মূল্য (৳)")}<input name="cost" type="number" required min={0} max={100000} step=".01" /></label><button className="button" disabled={busy}>{t("ক্রয়মূল্য নিশ্চিত করে সেভ করুন")}</button></form> : <p>{t("বর্তমান সব কপির ক্রয়মূল্য জানা আছে।")}</p>}</section>}
      <section className={styles.panel}><div className={styles.actions}><h2>{t("খরচের খাতা")}</h2>{permissions.includes("finance") && <button className="button" onClick={() => { setShowExpense(!showExpense); token.current = null; }}>{t(showExpense ? "বন্ধ করুন" : "খরচ যোগ করুন")}</button>}</div>
        {showExpense && <form className={styles.form} onSubmit={expense} onChange={() => { token.current = null; }}><label>{t("তারিখ")}<input type="date" name="date" defaultValue={today()} required /></label><label>{t("খরচের ধরন")}<select name="category">{Object.entries(expenseNames).map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}</select></label><label>{t("পরিমাণ (৳)")}<input name="amount" type="number" min=".01" max={1000000} step=".01" required /></label><label>{t("রসিদ / রেফারেন্স")}<input name="reference" minLength={2} maxLength={100} required /></label><label className={styles.wide}>{t("বিবরণ")}<input name="note" minLength={3} maxLength={500} required /></label><button className="button" disabled={busy}>{t("খরচ সেভ করুন")}</button></form>}
        <div className={styles.table} tabIndex={0}><table><thead><tr>{["তারিখ", "ধরন", "বিবরণ", "পরিমাণ", "পদক্ষেপ"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{data.expenses.map((e) => <tr key={e.id}><td>{dateLabel(e.date)}</td><td>{t(expenseNames[e.category])}</td><td>{e.note}<small>{e.reference}</small></td><td>{money(e.amountMinor / 100)}</td><td>{permissions.includes("finance") && <button className="button button-outline" disabled={busy} onClick={() => { if (voidId !== e.id) { setVoidId(e.id); return; } void perform(() => request(`/reports/expenses/${e.id}/void`, { method: "POST" }), "খরচের রেকর্ড বাতিল হয়েছে।"); setVoidId(""); }}>{t(voidId === e.id ? "বাতিল নিশ্চিত করুন" : "বাতিল করুন")}</button>}</td></tr>)}</tbody></table></div>{!data.expenses.length && <p className={styles.empty}>{t("এই সময়ে কোনো খরচ রেকর্ড হয়নি।")}</p>}
      </section>
    </>}
  </div>;
}
