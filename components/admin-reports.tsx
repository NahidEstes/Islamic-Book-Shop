"use client";
import Link from "next/link";
import { useAdminPreferences } from "./admin-preferences";

import { useId, useState } from "react";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, Coins, Layers3, Package, Plus, RotateCcw, ShoppingCart, Wallet } from "lucide-react";
import { bn, money } from "@/lib/catalog";
import type { Dashboard, SalesPeriod } from "@/lib/commerce-types";
import { adminHref, lowStockBooksHref, newBookHref } from "@/lib/admin-routes";
import { statusLabels } from "@/lib/types";
import { AdminResourceState, useAdminResource } from "./admin-context";
import { BookCover } from "./book-cover";
import { useStore } from "./store-provider";


function SalesChart({ periods }: { periods: SalesPeriod[] }) {
  const { t, money, dateLabel, chartDate } = useAdminPreferences();
  const gradient = useId();
  if (!periods.length) return <div className="signature-chart-empty"><BarChart3 size={36} aria-hidden="true" /><p>{t("এই সময়ের কোনো আদায় বা রিফান্ড নেই।")}</p><small>{t("লেনদেন রেকর্ড হলে এখানে বিক্রির ধারা দেখা যাবে।")}</small></div>;

  const width = 640, height = 200, pad = 9;
  const max = Math.max(0, ...periods.map((period) => period.net));
  const min = Math.min(0, ...periods.map((period) => period.net));
  const stepBase = Math.pow(10, Math.floor(Math.log10(Math.max((max - min) / 4, 1))));
  const step = (Math.ceil((max - min) / (4 * stepBase)) || 1) * stepBase;
  const top = Math.ceil(max / step) * step || (min === 0 ? step : 0);
  const bottom = Math.floor(min / step) * step;
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => top - i * step);
  const y = (value: number) => Math.round(pad + (top - value) * (height - 2 * pad) / (top - bottom));
  const points = periods.map((period, i) => ({ x: periods.length === 1 ? width / 2 : pad + i * (width - 2 * pad) / (periods.length - 1), y: y(period.net) }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const labels = periods.length === 1 ? [periods[0]] : [periods[0], ...(periods.length > 3 ? [periods[Math.floor((periods.length - 1) / 2)]] : []), periods[periods.length - 1]];

  return <>
    <div className="signature-plot">
      <div className="signature-chart-ticks" aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ top: `${100 * y(tick) / height}%` }}>{money(tick)}</span>)}</div>
      <div className="signature-chart-main">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t("তারিখ অনুযায়ী নিট আদায়ের চার্ট। নিচে চার্টের মান দেখুন।")}>
          <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="var(--signature-chart-fill, #60ab71)" stopOpacity=".45" /><stop offset="1" stopColor="var(--signature-chart-fill, #8dcf9b)" stopOpacity=".12" /></linearGradient></defs>
          {ticks.map((tick) => <line key={tick} x1="0" x2={width} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--signature-chart-axis, #a4ad9f)" : "var(--signature-chart-grid, #e2e6dc)"} vectorEffect="non-scaling-stroke" />)}
          {points.length > 1 && <><polygon points={`${points[0].x},${y(0)} ${line} ${points[points.length - 1].x},${y(0)}`} fill={`url(#${gradient})`} /><polyline points={line} fill="none" stroke="var(--signature-chart-line, #19733e)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></>}
          {points.map((point, index) => <circle key={periods[index].from} cx={point.x} cy={point.y} r="4" fill="var(--signature-chart-point, #fff)" stroke="var(--signature-chart-line, #19733e)" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{chartDate(periods[index].from)}: {money(periods[index].net)}</title></circle>)}
        </svg>
        <div className={`signature-chart-dates${periods.length === 1 ? " is-single" : ""}`} aria-hidden="true">{labels.map((period, i) => <span key={period.from}>{chartDate(i === labels.length - 1 ? period.to : period.from)}</span>)}</div>
      </div>
    </div>
    <details className="signature-chart-values"><summary>{t("চার্টের মান দেখুন")}</summary><ul>{periods.map((period) => <li key={period.from}><span>{dateLabel(period.from)}{period.from !== period.to ? ` – ${dateLabel(period.to)}` : ""}</span><strong>{money(period.net)}</strong></li>)}</ul></details>
  </>;
}

function ReportData({ range, canOpenOrders, canOpenBooks }: { range: string; canOpenOrders: boolean; canOpenBooks: boolean }) {
  const { t, bn, money, dateLabel } = useAdminPreferences();
  const { data, error } = useAdminResource<Dashboard>(`/dashboard${range}`);
  if (!data) return <AdminResourceState error={error} loading />;
  const summary = [
    { label: t("বাস্তব অর্ডার"), value: bn(data.orderCount), icon: ShoppingCart },
    { label: t("সংগৃহীত অর্থ"), value: money(data.collected), icon: Coins },
    { label: t("সম্পন্ন রিফান্ড"), value: money(data.refunded), icon: RotateCcw },
    { label: t("নিট আদায়"), value: money(data.netCollected), icon: Wallet },
  ];
  const extra = [[t("ডেমো অর্ডার"), bn(data.demoCount)], [t("বাতিল বাস্তব অর্ডার"), bn(data.cancelledCount)], [t("অর্ডারকৃত মূল্য (বাতিল বাদে)"), money(data.orderedTotal)], [t("ডেলিভারি সম্পন্ন বিক্রয়"), money(data.deliveredSales)], [t("বকেয়া COD"), money(data.outstanding)]];
  const lowStock = [...data.lowStock].sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title, "bn"));

  return <div className="signature-reports">
    <dl className="signature-metrics">{summary.map(({ label, value, icon: Icon }) => <div className="panel signature-metric" key={label}><span className="signature-icon" aria-hidden="true"><Icon size={22} /></span><div><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
    <div className="signature-insights">
      <section className="panel signature-panel">
        <h2><BarChart3 size={23} />{" " + t("বিক্রির ধারা")}</h2>
        <p className="signature-caption">{t("রিফান্ড বাদ দিয়ে প্রতি সময়পর্বের নিট আদায়")}</p>
        <SalesChart periods={data.salesTrend} />
      </section>
      <section className="panel signature-panel">
        <div className="signature-panel-heading">
          <h2><Layers3 size={23} />{" " + t("কম স্টক") + " "}<span className="signature-count">{bn(lowStock.length)}</span></h2>
          {canOpenBooks && <Link className="text-link" href={lowStockBooksHref}>{t("কম স্টকের সব বই")} <ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        {lowStock.length ? <ul className="signature-stock">{lowStock.map((book) => <li key={book.id}>
          <div className="signature-cover" aria-hidden="true"><BookCover product={book} small /></div>
          <div><strong>{book.title}</strong><p>{t("স্টকে আছে:") + " "}<b>{bn(book.stock)}{" " + t("কপি")}</b> <small>{t("· সীমা") + " "}{bn(book.lowStockThreshold ?? 5)}</small></p></div>
        </li>)}</ul> : <div className="signature-stock-empty"><BookOpen size={27} aria-hidden="true" /><p>{t("সব বইয়ের স্টক নির্ধারিত সীমার উপরে আছে।")}</p></div>}
      </section>
    </div>
    {canOpenOrders && <section className="panel signature-panel signature-recent">
      <div className="signature-panel-heading"><h2><Package size={23} />{" " + t("সাম্প্রতিক অর্ডার")}</h2><Link className="text-link" href={adminHref("orders")}>{t("সব অর্ডার") + " "}<ArrowRight size={16} /></Link></div>
      {data.recentOrders.length ? <div className="signature-table-wrap" tabIndex={0} role="region" aria-label={t("সাম্প্রতিক অর্ডারের তালিকা")}><table className="signature-table"><thead><tr>{[t("অর্ডার নম্বর"), t("তারিখ"), t("পাঠকের নাম"), t("বইয়ের সংখ্যা"), t("মোট মূল্য"), t("অবস্থা")].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.recentOrders.map((order) => <tr key={order.id}><th scope="row">{order.id}{order.demo && <span className="signature-order-demo">{t("ডেমো")}</span>}</th><td>{dateLabel(order.createdAt)}</td><td>{order.customerName}</td><td>{bn(order.quantity)}{t("টি")}</td><td>{money(order.total)}</td><td><span className={`signature-status status-${order.status}`}>{t(statusLabels[order.status])}</span></td></tr>)}</tbody></table></div> : <p className="signature-caption signature-empty-line">{t("এই সময়ের কোনো অর্ডার নেই।")}</p>}
    </section>}
    <details className="panel signature-more"><summary>{t("বিক্রির আরও হিসাব")}</summary><dl>{extra.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="signature-caption">{t("অর্ডারের হিসাবে অর্ডারের তারিখ এবং আদায় ও রিফান্ডে সংশ্লিষ্ট লেনদেনের তারিখ ব্যবহার করা হয়। ডেমো অর্ডারের টাকা বিক্রির হিসাবে যোগ হয় না।")}</p></details>
  </div>;
}

export function AdminReports({ canAddBook, canOpenOrders }: { canAddBook: boolean; canOpenOrders: boolean }) {
  const { t } = useAdminPreferences();
  const [range, setRange] = useState("");
  const [dateError, setDateError] = useState("");
  const { demo } = useStore();
  return <>
    <header className="signature-heading signature-report-heading">
      <div className="signature-report-title"><h1>{t("বিক্রির হিসাব")}</h1>{demo && <span className="signature-demo">{t("ডেমো")}</span>}</div>
      <div className="signature-report-controls">
        <form className="signature-date-form" method="post" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const from = String(form.get("from") || ""), to = String(form.get("to") || "");
          if (from && to && from > to) { setDateError(t("শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।")); return; }
          const params = new URLSearchParams();
          if (from) params.set("from", from);
          if (to) params.set("to", to);
          setDateError("");
          setRange(params.size ? `?${params}` : "");
        }}>
          <label>{t("শুরুর তারিখ")}<input name="from" type="date" /></label>
          <label>{t("শেষের তারিখ")}<input name="to" type="date" /></label>
          <button className="button button-outline" type="submit"><CalendarDays size={16} />{" " + t("হিসাব দেখুন")}</button>
        </form>
        {canAddBook && <Link className="button signature-add" href={newBookHref}><Plus size={19} />{" " + t("বই যোগ করুন")}</Link>}
      </div>
    </header>
    {dateError && <p className="form-error signature-error" role="alert">{dateError}</p>}
    <ReportData key={range} range={range} canOpenOrders={canOpenOrders} canOpenBooks={canAddBook} />
  </>;
}
