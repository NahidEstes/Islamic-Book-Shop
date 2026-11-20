"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, Clock3, History, PackageCheck, Wallet } from "lucide-react";
import { inventoryHref, lowStockBooksHref, newPurchaseHref, purchaseActionHref, purchaseHref } from "@/lib/admin-routes";
import { inventoryOverview, inventoryPeriodRange, type InventoryPeriod } from "@/lib/inventory-overview";
import { useAdminPreferences } from "./admin-preferences";
import { inventoryToday, useInventory } from "./inventory-context";
import { movementLabels, receivingLabels } from "./inventory-pages";
import styles from "./inventory-overview.module.css";

function MonthlyChart({ months }: { months: ReturnType<typeof inventoryOverview>["months"] }) {
  const { t, money, language } = useAdminPreferences();
  const max = Math.max(1, ...months.flatMap((month) => [month.purchasesMinor, month.paymentsMinor]));
  const monthFormatter = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "bn-BD", { month: "short", year: "numeric", timeZone: "UTC" });
  const label = (month: string) => monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
  return <>
    <div className={styles.legend}>
      <span><i className={styles.purchaseSwatch} />{t("ক্রয়")}</span><span><i className={styles.paymentSwatch} />{t("পরিশোধ")}</span>
    </div>
    {months.length ? <>
      <div className={styles.chartScale} aria-hidden="true">{money(max / 100)}</div>
      <div className={styles.chartScroll} tabIndex={0} role="region" aria-label={t("মাসভিত্তিক ক্রয় ও পরিশোধের চার্ট")}>
        <div className={styles.chart} aria-hidden="true">
          {months.map((month) => <div className={styles.month} key={month.month}>
            <div className={styles.bars}>
              <span className={styles.purchaseBar} style={{ height: `${100 * month.purchasesMinor / max}%` }} title={`${t("ক্রয়")} · ${money(month.purchasesMinor / 100)}`} />
              <span className={styles.paymentBar} style={{ height: `${100 * month.paymentsMinor / max}%` }} title={`${t("পরিশোধ")} · ${money(month.paymentsMinor / 100)}`} />
            </div><small>{label(month.month)}</small>
          </div>)}
        </div>
      </div>
      <details className={styles.chartValues}>
        <summary>{t("চার্টের মান দেখুন")}</summary>
        <div className={styles.tableScroll}><table><thead><tr><th>{t("মাস")}</th><th>{t("ক্রয়")}</th><th>{t("পরিশোধ")}</th></tr></thead>
          <tbody>{months.map((month) => <tr key={month.month}><th scope="row">{label(month.month)}</th><td>{money(month.purchasesMinor / 100)}</td><td>{money(month.paymentsMinor / 100)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </> : <p className={styles.empty}>{t("এই সময়ে কোনো ক্রয় বা পরিশোধ নেই।")}</p>}
  </>;
}

export function InventoryOverview() {
  const { data } = useInventory();
  const { t, bn, money, dateLabel, dateTime } = useAdminPreferences();
  const today = inventoryToday();
  const [period, setPeriod] = useState<InventoryPeriod>("month");
  const [customRange, setCustomRange] = useState(inventoryPeriodRange("month", today));
  const [error, setError] = useState("");
  const range = period === "custom" ? customRange : inventoryPeriodRange(period, today);
  const overview = inventoryOverview(data!, range, today);
  const pendingCopies = overview.pending.reduce((sum, purchase) => sum + purchase.lines.reduce((count, line) => count + line.quantity - line.received, 0), 0);
  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const from = String(values.get("from")), to = String(values.get("to"));
    if (from > to) { setError("শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।"); return; }
    setCustomRange({ from, to }); setError("");
  }
  return <div className={styles.overview}>
    <div className={styles.rangePanel}>
      <label><CalendarDays size={16} aria-hidden="true" />{t("হিসাবের সময়সীমা")}
        <select value={period} onChange={(event) => { setPeriod(event.target.value as InventoryPeriod); setError(""); }}>
          <option value="today">{t("আজ")}</option><option value="month">{t("এই মাস")}</option>
          <option value="last-month">{t("গত মাস")}</option><option value="all">{t("সব সময়")}</option><option value="custom">{t("নিজের সময়সীমা")}</option>
        </select>
      </label>
      {period === "custom" && <form className={styles.customRange} onSubmit={applyRange}>
        <label>{t("শুরুর তারিখ")}<input name="from" type="date" required defaultValue={customRange.from} /></label>
        <label>{t("শেষের তারিখ")}<input name="to" type="date" required defaultValue={customRange.to} /></label>
        <button className="button button-outline">{t("হিসাব দেখুন")}</button>
      </form>}
      <p className={styles.rangeHint}>{t("ক্রয় ও পরিশোধ নির্বাচিত সময়ের। স্টক, বাকি বই ও বকেয়া বর্তমান হিসাব।")}</p>
    </div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <dl className={styles.metrics}>
      {[
        { label: "বর্তমান স্টক", value: `${bn(overview.stock)} ${t("কপি")}`, icon: BookOpen },
        { label: "নির্বাচিত সময়ের ক্রয়", value: money(overview.purchasedMinor / 100), icon: BarChart3 },
        { label: "নির্বাচিত সময়ের পরিশোধ", value: money(overview.paidMinor / 100), icon: Wallet },
        { label: "বর্তমান বকেয়া", value: money(overview.dueMinor / 100), icon: Clock3 },
      ].map(({ label, value, icon: Icon }) => <div className="panel" key={label}><Icon size={20} aria-hidden="true" /><div><dt>{t(label)}</dt><dd>{value}</dd></div></div>)}
    </dl>

    <div className={styles.twoColumns}>
      <section className={`panel ${styles.card}`} aria-labelledby="inventory-pending">
        <div className={styles.cardHeading}><h2 id="inventory-pending"><PackageCheck size={21} aria-hidden="true" />{t("বই পাওয়া বাকি")}</h2><span className={styles.count}>{bn(overview.pending.length)}</span></div>
        <p className={styles.caption}>{t("অবশিষ্ট কপি")} · {bn(pendingCopies)}</p>
        <ul className={styles.scrollList}>{overview.pending.map((purchase) => <li key={purchase.id}>
          <div className={styles.itemHeading}><Link href={purchaseHref(purchase.id)}>{purchase.invoiceNo || purchase.number}</Link><span className={styles.badge}>{t(receivingLabels[purchase.lines.some((line) => line.received > 0) ? "partial" : "pending"])}</span></div>
          <p>{purchase.supplierName} · {dateLabel(purchase.date)}</p>
          <div className={styles.itemAction}><strong>{bn(purchase.lines.reduce((sum, line) => sum + line.quantity - line.received, 0))} {t("কপি বাকি")}</strong><Link className="button button-outline" href={purchaseActionHref(purchase.id, "receive")}>{t("প্রাপ্ত বই যোগ করুন")}<ArrowRight size={15} aria-hidden="true" /></Link></div>
        </li>)}</ul>
        {!overview.pending.length && <p className={styles.empty}>{t("সব চালানের বই পাওয়া গেছে।")}</p>}
        <Link className={styles.viewAll} href={`${inventoryHref}/purchases`}>{t("সব ক্রয় দেখুন")}<ArrowRight size={15} aria-hidden="true" /></Link>
      </section>

      <section className={`panel ${styles.card}`} aria-labelledby="inventory-dues">
        <div className={styles.cardHeading}><h2 id="inventory-dues"><Wallet size={21} aria-hidden="true" />{t("সরবরাহকারীর বকেয়া")}</h2><span className={styles.count}>{bn(overview.supplierDues.length)}</span></div>
        <p className={styles.caption}>{t("নির্ধারিত তারিখ অনুযায়ী অগ্রাধিকার")}</p>
        <ul className={styles.scrollList}>{overview.supplierDues.map((group) => <li key={group.supplierId}>
          <div className={styles.itemHeading}><strong>{group.name}</strong><strong>{money(group.totalMinor / 100)}</strong></div>
          {group.overdueMinor > 0 && <p className={styles.overdue}>{t("সময় পেরিয়েছে")} · {money(group.overdueMinor / 100)}</p>}
          <ul className={styles.invoices}>{group.invoices.map(({ purchase, dueMinor }) => <li key={purchase.id}>
            <div><Link href={purchaseHref(purchase.id)}>{purchase.invoiceNo || purchase.number}</Link>
              <p>{purchase.dueDate ? `${t("পরিশোধের তারিখ")} · ${dateLabel(purchase.dueDate)}` : t("পরিশোধের তারিখ নির্ধারিত হয়নি")}</p>
              <strong>{money(dueMinor / 100)}</strong>
            </div>
            <Link className="button button-outline" href={purchaseActionHref(purchase.id, "pay")}>{t("পরিশোধ লিখুন")}</Link>
          </li>)}</ul>
        </li>)}</ul>
        {!overview.supplierDues.length && <p className={styles.empty}>{t("সরবরাহকারীর কোনো বকেয়া নেই।")}</p>}
      </section>
    </div>

    <div className={styles.twoColumns}>
      <section className={`panel ${styles.card}`} aria-labelledby="inventory-urgent">
        <div className={styles.cardHeading}><h2 id="inventory-urgent"><BookOpen size={21} aria-hidden="true" />{t("জরুরি স্টক")}</h2><span className={styles.count}>{bn(overview.urgent.length)}</span></div>
        <p className={styles.caption}>{t("স্টক শূন্য বই আগে দেখানো হচ্ছে")}</p>
        <ul className={styles.scrollList}>{overview.urgent.map((book) => <li key={book.id}>
          <div className={styles.itemHeading}><strong>{book.title}</strong><span className={book.stock === 0 ? styles.overdue : styles.badge}>{book.stock === 0 ? t("স্টক শেষ") : `${bn(book.stock)} ${t("কপি")}`}</span></div>
          <div className={styles.itemAction}><p>{t("সতর্কসীমা")} · {bn(book.lowStockThreshold ?? 5)}</p><Link className="button button-outline" href={`${newPurchaseHref}?book=${encodeURIComponent(book.id)}`}>{t("নতুন ক্রয়")}</Link></div>
        </li>)}</ul>
        {!overview.urgent.length && <p className={styles.empty}>{t("সব বইয়ের স্টক নির্ধারিত সীমার উপরে আছে।")}</p>}
        <Link className={styles.viewAll} href={lowStockBooksHref}>{t("কম স্টকের সব বই")}<ArrowRight size={15} aria-hidden="true" /></Link>
      </section>

      <section className={`panel ${styles.card}`} aria-labelledby="inventory-chart">
        <div className={styles.cardHeading}><h2 id="inventory-chart"><BarChart3 size={21} aria-hidden="true" />{t("মাসভিত্তিক ক্রয় ও পরিশোধ")}</h2></div>
        <p className={styles.caption}>{t("ক্রয়ের তারিখ ও পরিশোধের তারিখ অনুযায়ী")}</p>
        <MonthlyChart months={overview.months} />
      </section>
    </div>

    <section className={`panel ${styles.card}`} aria-labelledby="inventory-recent">
      <div className={styles.cardHeading}><h2 id="inventory-recent"><History size={21} aria-hidden="true" />{t("সাম্প্রতিক স্টক পরিবর্তন")}</h2><Link className={styles.viewAll} href={`${inventoryHref}/movements`}>{t("সব পরিবর্তন দেখুন")}<ArrowRight size={15} aria-hidden="true" /></Link></div>
      <p className={styles.caption}>{t("নির্বাচিত সময়ের সাম্প্রতিক ৮টি রেকর্ড")}</p>
      <ul className={styles.activities}>{overview.movements.slice(0, 8).map((entry) => <li key={entry.id}>
        <div><strong>{entry.title}</strong><p>{t(movementLabels[entry.action] || entry.action)} · {t(entry.actorName === "bootstrap-owner" ? "মালিকের কী" : entry.actorName === "guest" ? "অতিথি" : entry.actorName)}</p></div>
        <div><strong className={entry.change.after < entry.change.before ? styles.overdue : styles.increase}>{entry.change.after > entry.change.before ? "+" : ""}{bn(entry.change.after - entry.change.before)}</strong><p>{bn(entry.change.before)} → {bn(entry.change.after)}</p></div>
        <time dateTime={entry.at}>{dateTime(entry.at)}</time>
      </li>)}</ul>
      {!overview.movements.length && <p className={styles.empty}>{t("এই সময়ে স্টক পরিবর্তনের রেকর্ড নেই।")}</p>}
    </section>

    <section className={`panel ${styles.card}`} aria-labelledby="inventory-invoices">
      <div className={styles.cardHeading}><h2 id="inventory-invoices">{t("সাম্প্রতিক ক্রয়")}</h2><Link className={styles.viewAll} href={`${inventoryHref}/purchases`}>{t("সব ক্রয় দেখুন")}<ArrowRight size={15} aria-hidden="true" /></Link></div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={t("নির্বাচিত সময়ের ক্রয়")}>
        <table><thead><tr>{["চালান", "সরবরাহকারী", "তারিখ", "মোট মূল্য"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>
          {overview.purchases.slice(0, 5).map((purchase) => <tr key={purchase.id}><th scope="row"><Link href={purchaseHref(purchase.id)}>{purchase.invoiceNo || purchase.number}</Link></th><td>{purchase.supplierName}</td><td>{dateLabel(purchase.date)}</td><td>{money(purchase.totalMinor / 100)}</td></tr>)}
        </tbody></table>
      </div>
      {!overview.purchases.length && <p className={styles.empty}>{t("এই সময়ে কোনো ক্রয় নেই।")}</p>}
    </section>
  </div>;
}
