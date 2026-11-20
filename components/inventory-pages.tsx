"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { isLowStock } from "@/lib/availability";
import { purchaseHref } from "@/lib/admin-routes";
import { paidForPurchase, purchaseStatus } from "@/lib/inventory";
import type { Supplier } from "@/lib/commerce-types";
import { useAdminPreferences } from "./admin-preferences";
import { useInventory } from "./inventory-context";
import styles from "./inventory.module.css";

export const receivingLabels = { pending: "বই আসেনি", partial: "আংশিক এসেছে", received: "সব বই এসেছে" };

export function PurchasesList({ recent = false }: { recent?: boolean }) {
  const { data } = useInventory();
  const { t, money, dateLabel } = useAdminPreferences();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const needle = query.trim().toLowerCase();
  const purchases = data!.purchases.filter((purchase) => (!needle || `${purchase.number} ${purchase.invoiceNo} ${purchase.supplierName}`.toLowerCase().includes(needle))
    && (status === "all" || purchaseStatus(purchase) === status));
  const visible = recent ? purchases.slice(0, 5) : purchases;
  return <>
    {!recent && <div className={styles.filters}>
      <label>{t("চালান খুঁজুন")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("নম্বর বা সরবরাহকারীর নাম")} /></label>
      <label>{t("বই পাওয়ার অবস্থা")}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("সব অবস্থা")}</option>{Object.entries(receivingLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    </div>}
    <div className={`panel ${styles.tableWrap}`} tabIndex={0} role="region" aria-label={t("ক্রয়ের তালিকা")}>
      <table><thead><tr>{["চালান", "সরবরাহকারী", "বই পাওয়ার অবস্থা", "মোট মূল্য", "বকেয়া"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{visible.map((purchase) => <tr key={purchase.id}>
          <th scope="row"><Link href={purchaseHref(purchase.id)}>{purchase.invoiceNo || purchase.number}</Link><small>{dateLabel(purchase.date)}</small></th>
          <td>{purchase.supplierName}</td><td><span className={styles.badge}>{t(receivingLabels[purchaseStatus(purchase)])}</span></td>
          <td>{money(purchase.totalMinor / 100)}</td><td>{money((purchase.totalMinor - paidForPurchase(purchase.id, data!.payments)) / 100)}</td>
        </tr>)}</tbody>
      </table>{!visible.length && <p className={styles.empty}>{t("এখনও কোনো ক্রয় নেই।")}</p>}
    </div>
  </>;
}

function SupplierForm({ supplier, onSaved }: { supplier?: Supplier; onSaved: () => void }) {
  const { t } = useAdminPreferences();
  const { mutate, busy } = useInventory();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const saved = await mutate(supplier ? `/suppliers/${supplier.id}` : "/suppliers", {
      name: values.get("name"), phone: values.get("phone"), email: values.get("email"),
      address: values.get("address"), note: values.get("note"), active: values.get("active") === "on",
    }, supplier ? "PUT" : "POST");
    if (saved) onSaved();
  }
  return <form className={`panel ${styles.form}`} onSubmit={submit}>
    <h2>{t(supplier ? "সরবরাহকারীর তথ্য" : "নতুন সরবরাহকারী")}</h2>
    <div className={styles.grid}>
      <label>{t("নাম")}<input name="name" required minLength={2} maxLength={150} defaultValue={supplier?.name} /></label>
      <label>{t("ফোন")}<input name="phone" type="tel" maxLength={50} defaultValue={supplier?.phone} /></label>
      <label>{t("ইমেইল")}<input name="email" type="email" maxLength={254} defaultValue={supplier?.email} /></label>
      <label>{t("ঠিকানা")}<input name="address" maxLength={600} defaultValue={supplier?.address} /></label>
    </div>
    <label>{t("মন্তব্য")}<textarea name="note" rows={2} maxLength={1000} defaultValue={supplier?.note} /></label>
    <label className={styles.checkbox}><input name="active" type="checkbox" defaultChecked={supplier?.active ?? true} />{t("সক্রিয়")}</label>
    <div className={styles.actions}><button className="button" disabled={busy}>{t("সংরক্ষণ করুন")}</button><button type="button" className="button button-outline" onClick={onSaved}>{t("বন্ধ করুন")}</button></div>
  </form>;
}

export function InventorySuppliers() {
  const { data } = useInventory();
  const { t, money } = useAdminPreferences();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [statement, setStatement] = useState<string | null>(null);
  return <>
    <div className={styles.sectionHeading}><h2>{t("সরবরাহকারী")}</h2><button type="button" className="button" onClick={() => setEditing("new")}>{t("নতুন সরবরাহকারী")}</button></div>
    {editing && <SupplierForm key={editing === "new" ? "new" : editing.id} supplier={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} />}
    <label className={styles.search}>{t("সরবরাহকারী খুঁজুন")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className={`panel ${styles.tableWrap}`} tabIndex={0} role="region" aria-label={t("সরবরাহকারীর তালিকা")}><table>
      <thead><tr>{["সরবরাহকারী", "ফোন", "অবস্থা", "মোট ক্রয়", "বকেয়া", "পরিচালনা"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
      <tbody>{data!.suppliers.filter((supplier) => `${supplier.name} ${supplier.phone}`.toLowerCase().includes(query.trim().toLowerCase())).map((supplier) => {
        const purchases = data!.purchases.filter((purchase) => purchase.supplierId === supplier.id);
        const total = purchases.reduce((sum, purchase) => sum + purchase.totalMinor, 0);
        const paid = purchases.reduce((sum, purchase) => sum + paidForPurchase(purchase.id, data!.payments), 0);
        return <tr key={supplier.id}><th scope="row"><button className={styles.textButton} onClick={() => setStatement(supplier.id)}>{supplier.name}</button><small>{supplier.email}</small></th>
          <td>{supplier.phone}</td><td>{t(supplier.active ? "সক্রিয়" : "নিষ্ক্রিয়")}</td><td>{money(total / 100)}</td><td>{money((total - paid) / 100)}</td>
          <td><button className={styles.textButton} onClick={() => setEditing(supplier)}>{t("সম্পাদনা")}</button></td></tr>;
      })}</tbody>
    </table>{!data!.suppliers.length && <p className={styles.empty}>{t("প্রথমে সরবরাহকারী যোগ করুন।")}</p>}</div>
    {statement && <section className="panel"><div className={styles.sectionHeading}><h2>{data!.suppliers.find((supplier) => supplier.id === statement)?.name}</h2><button type="button" onClick={() => setStatement(null)}>{t("বন্ধ করুন")}</button></div>
      {data!.purchases.filter((purchase) => purchase.supplierId === statement).map((purchase) => <p key={purchase.id}><Link href={purchaseHref(purchase.id)}>{purchase.invoiceNo || purchase.number}</Link> · {t("বকেয়া")} {money((purchase.totalMinor - paidForPurchase(purchase.id, data!.payments)) / 100)}</p>)}
    </section>}
  </>;
}

export const movementLabels: Record<string, string> = {
  "purchase.received": "ক্রয় থেকে প্রাপ্ত", "product.restock": "নতুন কপি যোগ", "product.update": "স্টক সংশোধন", "product.create": "প্রাথমিক স্টক",
  "order.reserved": "অর্ডারে বরাদ্দ", "order.restocked": "অর্ডার বাতিলে ফেরত", "return.restocked": "রিটার্ন থেকে ফেরত", "inventory.adjustment": "স্টক সংশোধন",
};

export function InventoryMovements() {
  const { data, mutate, busy } = useInventory();
  const { t, bn, dateTime } = useAdminPreferences();
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const requestId = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    const result = await mutate("/adjustments", { productId: values.get("productId"), delta: Number(values.get("delta")), reason: values.get("reason"), requestId: requestId.current });
    if (result) { setAdjusting(false); requestId.current = null; setSaved(true); }
  }
  return <>
    <div className={styles.sectionHeading}><h2>{t("স্টক পরিবর্তন")}</h2><button className="button button-outline" type="button" onClick={() => { setAdjusting(!adjusting); setSaved(false); }}>{t("স্টক সংশোধন")}</button></div>
    {saved && <p role="status">{t("স্টক আপডেট হয়েছে।")}</p>}
    {adjusting && <form className={`panel ${styles.form}`} onSubmit={adjust} onChange={() => { requestId.current = null; }}>
      <label>{t("বই")}<select name="productId" required><option value="">{t("বই নির্বাচন করুন")}</option>{data!.products.map((book) => <option key={book.id} value={book.id}>{book.title} · {bn(book.stock)}</option>)}</select></label>
      <label>{t("পরিবর্তন (+ / − কপি)")}<input name="delta" type="number" required min={-100000} max={100000} /></label>
      <label>{t("সংশোধনের কারণ")}<textarea name="reason" required minLength={5} maxLength={500} rows={2} /></label>
      <p className={styles.muted}>{t("ক্রয় করা বই নতুন ক্রয়ের চালান থেকে যোগ করুন। হারানো, ক্ষতিগ্রস্ত বা গণনার পার্থক্য এখানে লিখুন।")}</p>
      <button className="button" disabled={busy}>{t("সংশোধন সংরক্ষণ")}</button>
    </form>}
    <label className={styles.search}>{t("বই খুঁজুন")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <p className={styles.muted}>{t("সাম্প্রতিক ৫০০টি স্টক পরিবর্তন")}</p>
    <div className={`panel ${styles.tableWrap}`} tabIndex={0} role="region" aria-label={t("স্টক পরিবর্তনের তালিকা")}><table>
      <thead><tr>{["বই", "কাজ", "পরিবর্তন", "স্টক", "কর্মী", "সময়"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
      <tbody>{data!.movements.filter((entry) => entry.title.toLowerCase().includes(query.trim().toLowerCase())).map((entry) => <tr key={entry.id}>
        <th scope="row">{entry.title}{entry.change.purchaseId && <small><Link href={purchaseHref(entry.change.purchaseId)}>{t("চালান দেখুন")}</Link></small>}</th>
        <td>{t(movementLabels[entry.action] || entry.action)}{entry.note && <small>{entry.note}</small>}</td>
        <td>{entry.change.after > entry.change.before ? "+" : ""}{bn(entry.change.after - entry.change.before)}</td>
        <td>{bn(entry.change.before)} → {bn(entry.change.after)}</td><td>{t(entry.actorName === "bootstrap-owner" ? "মালিকের কী" : entry.actorName === "guest" ? "অতিথি" : entry.actorName)}</td><td>{dateTime(entry.at)}</td>
      </tr>)}</tbody>
    </table>{!data!.movements.length && <p className={styles.empty}>{t("এখনও স্টক পরিবর্তনের রেকর্ড নেই।")}</p>}</div>
  </>;
}
