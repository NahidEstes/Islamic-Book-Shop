"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { Purchase } from "@/lib/commerce-types";
import { inventoryHref, newBookHref, purchaseHref } from "@/lib/admin-routes";
import { paidForPurchase, purchaseLineCost, purchaseStatus } from "@/lib/inventory";
import { useAdmin } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import { inventoryToday, useInventory } from "./inventory-context";
import { receivingLabels } from "./inventory-pages";
import styles from "./inventory.module.css";

export function NewPurchase({ selectedBook = "" }: { selectedBook?: string }) {
  const { t, money } = useAdminPreferences();
  const { data, busy, mutate, reload } = useInventory();
  const { upload } = useAdmin();
  const router = useRouter();
  const [lines, setLines] = useState([{ key: "first", productId: selectedBook, quantity: 1, unitCost: "" }]);
  const [discount, setDiscount] = useState("");
  const [freight, setFreight] = useState("");
  const [receiptId, setReceiptId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const token = useRef<string | null>(null);
  const subtotal = lines.reduce((sum, line) => sum + Math.round(Number(line.unitCost) * 100) * line.quantity, 0);
  const total = subtotal - Math.round(Number(discount) * 100) + Math.round(Number(freight) * 100);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    token.current ??= crypto.randomUUID();
    const result = await mutate<{ purchase: Purchase }>("/purchases", {
      supplierId: values.get("supplierId"), invoiceNo: values.get("invoiceNo"), date: values.get("date"), dueDate: values.get("dueDate") || undefined, note: values.get("note"),
      lines: lines.map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost: Number(unitCost) })),
      discount: Number(discount), freight: Number(freight), receiptAssetId: receiptId, requestId: token.current,
    });
    if (result) router.push(purchaseHref(result.purchase.id));
  }
  return <form className={`panel ${styles.form}`} onSubmit={submit} onChange={() => { token.current = null; }}>
    <h2>{t("নতুন ক্রয়")}</h2>
    <div className={styles.grid}>
      <label>{t("সরবরাহকারী")}<select name="supplierId" required><option value="">{t("নির্বাচন করুন")}</option>{data!.suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label>{t("ক্রয়ের তারিখ")}<input name="date" type="date" required defaultValue={inventoryToday()} /></label>
      <label>{t("পরিশোধের নির্ধারিত তারিখ")}<input name="dueDate" type="date" /></label>
      <label>{t("সরবরাহকারীর চালান নম্বর")}<input name="invoiceNo" maxLength={80} /></label>
    </div>
    <div className={styles.actions}>
      <Link href={`${inventoryHref}/suppliers`} target="_blank" rel="noopener noreferrer">{t("নতুন সরবরাহকারী")}</Link>
      <Link href={newBookHref} target="_blank" rel="noopener noreferrer">{t("নতুন বই যোগ করুন")}</Link>
      <button type="button" onClick={() => void reload()}>{t("তালিকা রিফ্রেশ")}</button>
    </div>
    <fieldset disabled={busy || uploading} className={styles.lines}>
      <legend>{t("কেনা বই")}</legend>
      {lines.map((line, index) => <div className={styles.purchaseLine} key={line.key}>
        <label>{t("বই")}<select value={line.productId} required onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, productId: event.target.value } : item))}>
          <option value="">{t("বই নির্বাচন করুন")}</option>{data!.products.map((book) => <option key={book.id} value={book.id} disabled={book.id !== line.productId && lines.some((item) => item.productId === book.id)}>{book.title}</option>)}</select></label>
        <label>{t("কপি")}<input type="number" required min={1} max={100000} value={line.quantity} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
        <label>{t("প্রতি কপির ক্রয়মূল্য (৳)")}<input type="number" required min={0} max={1000000} step=".01" value={line.unitCost} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, unitCost: event.target.value } : item))} /></label>
        <button type="button" className="button button-outline" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>{t("সরান")}</button>
      </div>)}
      <button type="button" className="button button-outline" disabled={lines.length >= 50} onClick={() => setLines([...lines, { key: crypto.randomUUID(), productId: "", quantity: 1, unitCost: "" }])}>{t("আরও বই যোগ করুন")}</button>
    </fieldset>
    <div className={styles.grid}>
      <label>{t("মোট ছাড় (৳)")}<input type="number" min={0} max={subtotal / 100} step=".01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
      <label>{t("চালানের পরিবহন খরচ (৳)")}<input type="number" min={0} max={1000000000} step=".01" value={freight} onChange={(event) => setFreight(event.target.value)} /></label>
    </div>
    <label>{t("বিলের ছবি বা PDF")}<input type="file" disabled={uploading || busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setUploading(true); setError(""); setReceiptId(undefined);
      try { setReceiptId((await upload(file, "receipt")).id); }
      catch (failure) { setError((failure as Error).message); }
      finally { setUploading(false); }
    }} /></label>
    {receiptId && <p role="status">{t("বিলের ফাইল যুক্ত হয়েছে।")}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <label>{t("মন্তব্য")}<textarea name="note" maxLength={1500} rows={2} /></label>
    <div className={styles.total}>{t("চালানের মোট")}<strong>{money(total / 100)}</strong></div>
    <p className={styles.muted}>{t("চালান সেভের পর প্রাপ্ত বই ও পরিশোধ আলাদাভাবে লিখুন।")}</p>
    <button className="button" disabled={busy || uploading}>{t(busy ? "অপেক্ষা করুন…" : "ক্রয়ের চালান সেভ করুন")}</button>
  </form>;
}

export function PurchaseDetails({ id, initialAction }: { id: string; initialAction?: "receive" | "pay" }) {
  const { data, busy, mutate } = useInventory();
  const { request } = useAdmin();
  const { t, bn, money, dateLabel, dateTime } = useAdminPreferences();
  const purchase = data!.purchases.find((item) => item.id === id);
  const [receiving, setReceiving] = useState(initialAction === "receive" && !!purchase && purchaseStatus(purchase) !== "received");
  const [paying, setPaying] = useState(initialAction === "pay" && !!purchase && paidForPurchase(id, data!.payments) < purchase.totalMinor);
  const [message, setMessage] = useState("");
  const token = useRef<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  if (!purchase) return <p className="form-error" role="alert">{t("ক্রয়ের রেকর্ড পাওয়া যায়নি।")}</p>;
  const paid = paidForPurchase(purchase.id, data!.payments);
  const due = purchase.totalMinor - paid;
  async function saveDueDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = new FormData(event.currentTarget).get("dueDate") || null;
    if (await mutate(`/purchases/${id}/due-date`, { dueDate: date, expected: purchase!.dueDate ?? null }, "PUT")) {
      setEditingDate(false);
      setMessage("পরিশোধের তারিখ সেভ হয়েছে।");
    }
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    token.current ??= crypto.randomUUID();
    const items = purchase!.lines.map((line) => ({ productId: line.productId, quantity: Number(values.get(line.productId) || 0) })).filter((line) => line.quantity > 0);
    if (!items.length) { setMessage("প্রাপ্ত কপির সংখ্যা দিন।"); return; }
    if (await mutate(`/purchases/${id}/receive`, { items, requestId: token.current })) { setReceiving(false); token.current = null; setMessage("প্রাপ্ত বই স্টকে যোগ হয়েছে।"); }
  }
  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    token.current ??= crypto.randomUUID();
    const result = await mutate(`/purchases/${id}/payments`, {
      amount: Number(values.get("amount")), reference: values.get("reference"), date: values.get("date"), method: values.get("method"), note: values.get("note"), requestId: token.current,
    });
    if (result) { setPaying(false); token.current = null; setMessage("পরিশোধ রেকর্ড হয়েছে।"); }
  }
  async function download() {
    setDownloading(true); setMessage("");
    try {
      const file = await request<{ filename: string; mime: string; base64: string }>(`/inventory/receipts/${purchase!.receiptAssetId}`);
      const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
      const link = document.createElement("a"); link.href = url; link.download = file.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (failure) { setMessage((failure as Error).message); }
    finally { setDownloading(false); }
  }
  return <>
    <section className={`panel ${styles.form}`}>
      <div className={styles.sectionHeading}><h2>{purchase.invoiceNo || purchase.number}</h2><span className={styles.badge}>{t(receivingLabels[purchaseStatus(purchase)])}</span></div>
      <p>{purchase.supplierName} · {dateLabel(purchase.date)}</p>
      <div className={styles.actions}>
        <p>{t("পরিশোধের নির্ধারিত তারিখ")} · {purchase.dueDate ? dateLabel(purchase.dueDate) : t("নির্ধারিত হয়নি")}</p>
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => setEditingDate(!editingDate)}>{t("তারিখ পরিবর্তন")}</button>
      </div>
      {editingDate && <form className={styles.filters} onSubmit={saveDueDate}>
        <label>{t("পরিশোধের নির্ধারিত তারিখ")}<input name="dueDate" type="date" min={purchase.date} defaultValue={purchase.dueDate} /></label>
        <button className="button button-outline" disabled={busy}>{t("তারিখ সেভ করুন")}</button>
      </form>}
      {purchase.note && <p>{purchase.note}</p>}
      <div className={styles.tableWrap}><table><thead><tr>{["বই", "কেনা কপি", "প্রাপ্ত", "ক্রয়মূল্য", "প্রতি কপির মোট খরচ"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>
        {purchase.lines.map((line) => <tr key={line.productId}><th scope="row">{line.title}</th><td>{bn(line.quantity)}</td><td>{bn(line.received)}</td><td>{money(line.unitCostMinor / 100)}</td><td>{money(Math.round(purchaseLineCost(purchase, line.productId)) / 100)}</td></tr>)}
      </tbody></table></div>
      <p className={styles.muted}>{t("প্রতি কপির মোট খরচে এই চালানের ছাড় ও পরিবহন আনুপাতিকভাবে অন্তর্ভুক্ত।")}</p>
      <dl className={styles.totals}>{[["বইয়ের মোট মূল্য", purchase.subtotalMinor], ["ছাড়", -purchase.discountMinor], ["পরিবহন", purchase.freightMinor], ["চালানের মোট", purchase.totalMinor], ["পরিশোধিত", paid], ["বকেয়া", due]].map(([label, amount]) =>
        <div key={label}><dt>{t(String(label))}</dt><dd>{money(Number(amount) / 100)}</dd></div>)}</dl>
      <div className={styles.actions}>
        {purchaseStatus(purchase) !== "received" && <button type="button" className="button" disabled={busy} onClick={() => { setReceiving(!receiving); setPaying(false); token.current = null; setMessage(""); }}>{t("প্রাপ্ত বই যোগ করুন")}</button>}
        {due > 0 && <button type="button" className="button button-outline" disabled={busy} onClick={() => { setPaying(!paying); setReceiving(false); token.current = null; setMessage(""); }}>{t("পরিশোধ লিখুন")}</button>}
        {purchase.receiptAssetId && <button type="button" className="button button-outline" disabled={downloading} onClick={() => void download()}>{t("বিল ডাউনলোড")}</button>}
      </div>
    </section>
    {message && <p role="status">{t(message)}</p>}
    {receiving && <form className={`panel ${styles.form}`} onSubmit={receive} onChange={() => { token.current = null; }}>
      <h2>{t("হাতে পাওয়া কপি")}</h2>
      {purchase.lines.filter((line) => line.received < line.quantity).map((line) => <label key={line.productId}>{line.title}<input type="number" name={line.productId} min={0} max={line.quantity - line.received} required defaultValue={line.quantity - line.received} /></label>)}
      <button className="button" disabled={busy}>{t("প্রাপ্ত কপি নিশ্চিত করুন")}</button>
    </form>}
    {paying && <form className={`panel ${styles.form}`} onSubmit={pay} onChange={() => { token.current = null; }}>
      <h2>{t("পরিশোধ লিখুন")}</h2>
      <div className={styles.grid}>
        <label>{t("পরিশোধের পরিমাণ (৳)")}<input name="amount" type="number" min=".01" max={due / 100} step=".01" required /></label>
        <label>{t("তারিখ")}<input name="date" type="date" required defaultValue={inventoryToday()} /></label>
        <label>{t("রসিদ / রেফারেন্স")}<input name="reference" minLength={2} maxLength={120} required /></label>
        <label>{t("মাধ্যম")}<select name="method"><option value="cash">{t("নগদ")}</option><option value="bank">{t("ব্যাংক")}</option></select></label>
      </div>
      <label>{t("মন্তব্য")}<input name="note" maxLength={1000} /></label>
      <button className="button" disabled={busy}>{t("পরিশোধ রেকর্ড করুন")}</button>
    </form>}
    <section className={`panel ${styles.form}`}><h2>{t("পরিশোধের ইতিহাস")}</h2>
      {data!.payments.filter((payment) => payment.purchaseId === id).map((payment) => <p key={payment.id}>{dateLabel(payment.date)} · {money(payment.amountMinor / 100)} · {t(payment.method === "cash" ? "নগদ" : "ব্যাংক")} · {payment.reference}</p>)}
      {!paid && <p>{t("এখনও পরিশোধ রেকর্ড হয়নি।")}</p>}
      <h3>{t("বই পাওয়ার ইতিহাস")}</h3>
      {purchase.receipts.map((receipt) => <p key={receipt.id}>{dateTime(receipt.at)} · {bn(receipt.items.reduce((sum, line) => sum + line.quantity, 0))} {t("কপি")}</p>)}
    </section>
  </>;
}
