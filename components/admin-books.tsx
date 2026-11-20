"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, History, PackagePlus, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { availableQuantity, isLowStock, isOutOfStock, isPreorder, salePrice } from "@/lib/availability";
import { editBookHref, newBookHref, newPurchaseHref, stockTabs, stockTabHref, type StockTab } from "@/lib/admin-routes";
import { categories } from "@/lib/catalog";
import type { StockHistoryEntry } from "@/lib/commerce-types";
import type { Product } from "@/lib/types";
import { AdminResourceState, useAdmin, useAdminResource } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import { BookCover } from "./book-cover";
import { useStore } from "./store-provider";
import styles from "./admin-books.module.css";

const tabLabels: Record<StockTab, string> = { all: "সব বই", "low-stock": "কম স্টক", "out-of-stock": "স্টক শেষ" };

function StockManager({ product, onSaved, onClose }: { product: Product; onSaved: (product: Product) => void; onClose: () => void }) {
  const { t, bn, dateTime } = useAdminPreferences();
  const { request, permissions } = useAdmin();
  const { refresh } = useStore();
  const history = useAdminResource<{ entries: StockHistoryEntry[] }>(`/products/${encodeURIComponent(product.id)}/stock-history`);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<{ quantity: number; id: string } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  async function addStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const added = Number(quantity);
    if (!requestRef.current || requestRef.current.quantity !== added) requestRef.current = { quantity: added, id: crypto.randomUUID() };
    setBusy(true);
    setMessage(null);
    try {
      const response = await request<{ product: Product }>(`/products/${encodeURIComponent(product.id)}/stock`, {
        method: "POST", body: JSON.stringify({ quantity: added, requestId: requestRef.current.id }),
      });
      onSaved(response.product);
      setQuantity("");
      requestRef.current = null;
      setMessage({ text: "নতুন কপি স্টকে যোগ হয়েছে।" });
      void history.reload().catch(() => {});
      void refresh();
    } catch (failure) {
      setMessage({ text: (failure as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className={styles.drawer} aria-labelledby="stock-manager-title" onClose={onClose}>
    <header className={styles.drawerHeader}>
      <div><p>{t("স্টক ও ইতিহাস")}</p><h2 id="stock-manager-title">{product.title}</h2></div>
      <button type="button" className={styles.close} aria-label={t("বন্ধ করুন")} onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
    </header>
    <div className={styles.drawerBody}>
      {permissions.includes("inventory") && <Link className="button button-outline" href={`${newPurchaseHref}?book=${encodeURIComponent(product.id)}`}>{t("ক্রয় থেকে স্টক যোগ করুন")}</Link>}
      <div className={styles.stockSummary}>
        <p>{t("বর্তমান স্টক")}<strong>{bn(product.stock)} {t("কপি")}</strong></p>
        <p>{t("সতর্কসীমা")}<strong>{bn(product.lowStockThreshold ?? 5)} {t("কপি")}</strong></p>
      </div>
      <form className={styles.stockForm} onSubmit={addStock}>
        <label>{t("নতুন এসেছে (কপি)")}<input type="number" required min={1} max={100000} step={1} value={quantity}
          disabled={busy} onChange={(event) => { setQuantity(event.target.value); setMessage(null); }} /></label>
        {quantity && Number(quantity) > 0 && <p className={styles.muted}>{t("যোগ করার পর স্টক")} · {bn(product.stock + Number(quantity))}</p>}
        {isPreorder(product) && <p className={styles.muted}>{t("এটি সাধারণ স্টকে যোগ হবে। প্রি-অর্ডারের কোটা আলাদা।")}</p>}
        {message && <p className={message.error ? "form-error" : styles.success} role={message.error ? "alert" : "status"}>{t(message.text)}</p>}
        <button type="submit" className="button" disabled={busy}><PackagePlus size={18} aria-hidden="true" />{t(busy ? "অপেক্ষা করুন…" : "স্টকে যোগ করুন")}</button>
      </form>
      <section className={styles.history}>
        <h3><History size={18} aria-hidden="true" />{t("স্টক পরিবর্তনের ইতিহাস")}</h3>
        <p className={styles.muted}>{t("নতুন কপি, অর্ডার, রিটার্ন ও স্টক সংশোধনের রেকর্ড।")}</p>
        <AdminResourceState error={history.error} loading={!history.data} />
        {history.data && (history.data.entries.length ? <ol>{history.data.entries.map((entry) => <li key={entry.id}>
          <div><strong>{entry.change.added ? `+${bn(entry.change.added)} ${t("কপি")}` : t("স্টক সংশোধন")}</strong>
            <span>{bn(entry.change.before)} → {bn(entry.change.after)}</span></div>
          <p>{entry.actorName === "bootstrap-owner" ? t("মালিকের কী") : entry.actorName}</p>
          <time dateTime={entry.at}>{dateTime(entry.at)}</time>
        </li>)}</ol> : <p className={styles.empty}>{t("এখনও স্টক পরিবর্তনের রেকর্ড নেই।")}</p>)}
      </section>
    </div>
  </dialog>;
}

export function AdminCatalog() {
  const { t, bn, money } = useAdminPreferences();
  const { demoCatalog } = useStore();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: StockTab = stockTabs.find((value) => value === requested) ?? "all";
  const { data, error, setData } = useAdminResource<{ products: Product[] }>("/catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [publisher, setPublisher] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = data?.products.find((book) => book.id === selectedId);
  const counts = {
    all: data?.products.length ?? 0,
    "low-stock": data?.products.filter(isLowStock).length ?? 0,
    "out-of-stock": data?.products.filter(isOutOfStock).length ?? 0,
  };
  const publishers = [...new Set(data?.products.map((book) => book.publisher) ?? [])].sort((a, b) => a.localeCompare(b));
  const needle = query.trim().toLowerCase();
  const books = (data?.products ?? []).filter((book) => {
    const inTab = tab === "all" || (tab === "low-stock" ? isLowStock(book) : isOutOfStock(book));
    return inTab && (!needle || `${book.title} ${book.author} ${book.publisher} ${book.isbn || ""}`.toLowerCase().includes(needle))
      && (category === "all" || book.category === category) && (!publisher || book.publisher === publisher);
  });
  if (tab !== "all") books.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title));

  return <div className={styles.workspace}>
    <header className="signature-heading">
      <h1>{t("বই ও প্রিভিউ")}</h1>
      {!demoCatalog && <Link className="button button-outline" href="/admin/books/import">{t("CSV import / export")}</Link>}
      <Link className="button" href={newBookHref}><Plus size={18} aria-hidden="true" />{t("বই যোগ করুন")}</Link>
    </header>
    <AdminResourceState error={error} loading={!data} />
    {data && <>
      <nav className={styles.tabs} aria-label={t("স্টক অনুযায়ী বই")}>
        {stockTabs.map((value) => <Link key={value} href={stockTabHref(value)} aria-current={tab === value ? "page" : undefined}
          onClick={(event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (tab !== value) window.history.pushState(null, "", stockTabHref(value));
          }}>{t(tabLabels[value])}<span>{bn(counts[value])}</span></Link>)}
      </nav>
      <div className={styles.filters}>
        <label className={styles.search}><span className="sr-only">{t("বই খুঁজুন")}</span><Search size={18} aria-hidden="true" />
          <input ref={search} type="search" value={query} placeholder={t("নাম, লেখক বা ISBN দিয়ে খুঁজুন")} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>{t("বিভাগ")}<select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
        <label>{t("প্রকাশনী")}<select value={publisher} onChange={(event) => setPublisher(event.target.value)}>
          <option value="">{t("সব প্রকাশনী")}</option>{publishers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
      <div className={styles.listMeta}>
        <p role="status">{t("ফলাফল")} · {bn(books.length)}</p>
        {tab === "low-stock" && <p>{t("সতর্কসীমার সমান বা কম। স্টক শূন্য বইও অন্তর্ভুক্ত।")}</p>}
      </div>
      {books.length ? <div className={`panel ${styles.tablePanel}`}>
        <table className={styles.table} role="table" aria-label={t("বইয়ের স্টক তালিকা")}>
          <thead role="rowgroup"><tr role="row">
            {[t("বই"), t("প্রকাশনী"), t("বিক্রয়মূল্য"), t("বর্তমান স্টক"), t("সতর্কসীমা"), t("পরিচালনা")].map((label) => <th key={label} role="columnheader" scope="col">{label}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{books.map((book) => <tr key={book.id} role="row">
            <th role="rowheader" scope="row" className={styles.bookCell}>
              <div className={styles.bookInfo}>
                <div className={styles.cover} aria-hidden="true"><BookCover product={book} small /></div>
                <div><Link href={editBookHref(book.id)} prefetch={false}>{book.title}</Link><small>{book.author}</small>
                  {book.sample !== false && <small>{t("নমুনা")}</small>}</div>
              </div>
            </th>
            <td role="cell" className={styles.publisher}>{book.publisher}</td>
            <td role="cell" className={styles.price}>{money(salePrice(book))}</td>
            <td role="cell" className={styles.quantity}>
              <span className={styles.stockBadge} data-level={isOutOfStock(book) ? "out" : isLowStock(book) ? "low" : "normal"}>{bn(book.stock)} {t("কপি")}</span>
              {isPreorder(book) && <small>{t("প্রি-অর্ডার")} · {bn(availableQuantity(book))}</small>}
            </td>
            <td role="cell" className={styles.threshold}><span className={styles.mobileLabel}>{t("সতর্কসীমা")} · </span>{bn(book.lowStockThreshold ?? 5)}</td>
            <td role="cell" className={styles.rowActions}>
              <button type="button" className="button button-outline" aria-haspopup="dialog" onClick={() => setSelectedId(book.id)}><PackagePlus size={16} aria-hidden="true" />{t("স্টক ও ইতিহাস")}</button>
              <Link href={editBookHref(book.id)} prefetch={false}>{t("সম্পাদনা")}</Link>
            </td>
          </tr>)}</tbody>
        </table>
      </div> : <div className={`panel ${styles.emptyState}`}>
        <BookOpen size={30} aria-hidden="true" /><p>{t("এই ট্যাব বা ফিল্টারে কোনো বই নেই।")}</p>
        {(query || category !== "all" || publisher) && <button type="button" className="button button-outline" onClick={() => { setQuery(""); setCategory("all"); setPublisher(""); }}>{t("ফিল্টার মুছুন")}</button>}
      </div>}
    </>}
    {selected && <StockManager key={selected.id} product={selected} onClose={() => {
      setSelectedId(null);
      // Restocking can remove the opener from the active tab.
      if (document.activeElement === document.body) search.current?.focus();
    }} onSaved={(product) => setData((current) => current && { ...current, products: current.products.map((book) => book.id === product.id ? product : book) })} />}
  </div>;
}
