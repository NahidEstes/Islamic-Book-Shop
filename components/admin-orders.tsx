"use client";

import { ArrowRight, CheckCircle2, ClipboardList, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { statusLabels, type Order, type OrderStatus } from "@/lib/types";
import { normalizePhone } from "@/lib/validation";
import { AdminResourceState, useAdmin, useAdminResource } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import { useStore } from "./store-provider";
import styles from "./admin-orders.module.css";

const filters = [
  ["all", "সব অর্ডার"], ["pending", "নতুন"], ["confirmed", statusLabels.confirmed],
  ["shipped", statusLabels.shipped], ["delivered", statusLabels.delivered],
  ["preorder", "প্রি-অর্ডার"], ["cancelled", statusLabels.cancelled],
] as const;
type Filter = (typeof filters)[number][0];
type Scope = "all" | "live" | "demo";
type OrderAction = "confirmed" | "shipped" | "delivered" | "cancelled" | "ready";

const actionLabels: Record<OrderAction, string> = {
  confirmed: "অর্ডার নিশ্চিত করুন",
  shipped: "পাঠানো হয়েছে চিহ্নিত করুন",
  delivered: "ডেলিভারি সম্পন্ন করুন",
  cancelled: "অর্ডার বাতিল করুন",
  ready: "সব প্রি-অর্ডার বই প্রস্তুত",
};
const paymentLabels = { unpaid: "অপরিশোধিত", partial: "আংশিক পরিশোধিত", paid: "পরিশোধিত", refunded: "অর্থ ফেরত হয়েছে" };
const nextStatus: Partial<Record<OrderStatus, OrderAction>> = { pending: "confirmed", confirmed: "shipped", shipped: "delivered" };
const preorderLabels = { "awaiting-release": "প্রকাশের অপেক্ষায়", ready: "পাঠানোর জন্য প্রস্তুত", fulfilled: "ডেলিভারি সম্পন্ন" };

function OrderBadges({ order }: { order: Order }) {
  const { t } = useAdminPreferences();
  return <span className={styles.badges}>
    <span className={`signature-status status-${order.status}`}>{t(statusLabels[order.status])}</span>
    {order.demo && <span className={styles.tag}>{t("ডেমো")}</span>}
    {order.items.some((item) => item.preorder) && <span className={styles.tag}>{t("প্রি-অর্ডার")}</span>}
  </span>;
}

function PaymentBadge({ status }: { status: Order["paymentStatus"] }) {
  const { t } = useAdminPreferences();
  return <span className={styles.payment} data-payment={status}>{t(paymentLabels[status])}</span>;
}

export function AdminOrders() {
  const { t, bn, money, dateLabel } = useAdminPreferences();
  const { data, error, setData } = useAdminResource<{ orders: Order[]; demo: boolean }>("/orders");
  const { request } = useAdmin();
  const { refresh } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null);
  const [feedback, setFeedback] = useState<{ orderId: string; text: string; error?: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const activeScope = scope ?? (data?.demo ? "demo" : "live");
  const needle = query.trim().toLowerCase();
  const phone = normalizePhone(needle);
  const searchPhone = /^\+?\d+$/.test(phone);
  const visible = data?.orders.filter((order) => {
    if (activeScope !== "all" && order.demo !== (activeScope === "demo")) return false;
    const matchesStatus = filter === "preorder" ? order.items.some((item) => item.preorder) : filter === "all" || order.status === filter;
    return matchesStatus && (!needle || order.id.toLowerCase().includes(needle) || order.customer.name.toLowerCase().includes(needle)
      || (searchPhone && normalizePhone(order.customer.phone).includes(phone)));
  }) ?? [];
  const selected = data?.orders.find((order) => order.id === selectedId);
  const dialogOpen = Boolean(selected);
  const drawerFeedback = feedback?.orderId === selectedId ? feedback : null;

  useEffect(() => {
    if (dialogOpen && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      closeButton.current?.focus();
    }
  }, [dialogOpen]);

  function closeDetails() {
    setSelectedId(null);
    if (document.activeElement === document.body) search.current?.focus();
  }

  async function updateOrder(order: Order, action: OrderAction) {
    if (pendingAction) return;
    setPendingAction(action);
    setFeedback(null);
    try {
      const path = `/orders/${encodeURIComponent(order.id)}`;
      const result = await request<{ order: Order }>(action === "ready" ? `${path}/preorder-ready` : path, {
        method: "PATCH", body: JSON.stringify(action === "ready" ? {} : { status: action }),
      });
      setData((current) => current && { ...current, orders: current.orders.map((item) => item.id === order.id ? result.order : item) });
      setConfirmCancel(false);
      setFeedback({ orderId: order.id, text: action === "ready" ? "প্রি-অর্ডার প্রস্তুত হিসেবে রেকর্ড হয়েছে" : "অর্ডারের অবস্থা আপডেট হয়েছে" });
      if (action === "cancelled") void refresh();
    } catch (failure) {
      setFeedback({ orderId: order.id, text: failure instanceof Error ? failure.message : "অর্ডার আপডেট করা যায়নি।", error: true });
    } finally {
      setPendingAction(null);
    }
  }

  const isWaiting = selected?.preorderStatus === "awaiting-release";
  const canMarkReady = isWaiting && (selected.status === "pending" || selected.status === "confirmed");
  const primary = selected && (isWaiting && selected.status === "confirmed" ? "ready" : nextStatus[selected.status]);
  const canCancel = selected && selected.paymentStatus === "unpaid" && (selected.status === "pending" || selected.status === "confirmed");

  return <div className={styles.workspace}>
    <AdminResourceState error={error} loading={!data} />
    {data && <>
      <div className={styles.filters}>
        <label className={styles.search}>
          <span className="sr-only">{t("অর্ডার খুঁজুন")}</span>
          <Search size={18} aria-hidden="true" />
          <input ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={t("অর্ডার নম্বর, নাম বা ফোন দিয়ে খুঁজুন")} />
        </label>
        <label className={styles.scope}>{t("অর্ডারের ধরন")}
          <select value={activeScope} onChange={(event) => setScope(event.target.value as Scope)}>
            <option value="live">{t("বাস্তব অর্ডার")}</option><option value="demo">{t("ডেমো অর্ডার")}</option>
            <option value="all">{t("সব ধরনের অর্ডার")}</option>
          </select>
        </label>
      </div>
      <div className={styles.tabs} role="group" aria-label={t("অর্ডারের অবস্থা দিয়ে ফিল্টার")}>
        {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}
      </div>
      <div className={styles.listMeta}>
        <p role="status">{visible.length === 1 ? t("একটি অর্ডার পাওয়া গেছে") : `${bn(visible.length)} ${t("টি অর্ডার পাওয়া গেছে")}`}</p>
        {data.orders.length >= 200 && <p>{t("সাম্প্রতিক ২০০টি অর্ডারের মধ্যে")}</p>}
      </div>
      {!dialogOpen && feedback && <p className={feedback.error ? "form-error" : styles.feedback} role={feedback.error ? "alert" : "status"}>{t(feedback.text)}</p>}
      {visible.length ? <div className={`panel ${styles.tablePanel}`}>
        <table className={styles.table} role="table" aria-label={t("অর্ডারের তালিকা")}>
          <thead role="rowgroup"><tr role="row">
            {[t("অর্ডার নম্বর"), t("পাঠক"), t("অবস্থা"), t("পেমেন্ট"), t("মোট মূল্য")].map((label) => <th key={label} role="columnheader" scope="col">{label}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{visible.map((order) => <tr key={order.id} role="row">
            <th role="rowheader" scope="row" className={styles.orderCell}>
              <button type="button" aria-haspopup="dialog" onClick={() => {
                if (!pendingAction) setFeedback(null);
                setConfirmCancel(false);
                setSelectedId(order.id);
              }}>{order.id}<ArrowRight size={15} aria-hidden="true" /></button>
              <time dateTime={order.createdAt}>{dateLabel(order.createdAt)}</time>
            </th>
            <td role="cell" className={styles.customer}>{order.customer.name}</td>
            <td role="cell"><OrderBadges order={order} /></td>
            <td role="cell"><PaymentBadge status={order.paymentStatus} /></td>
            <td role="cell" className={styles.amount}>{money(order.total)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className={`panel ${styles.empty}`}>
        <ClipboardList size={28} aria-hidden="true" />
        <p>{t(data.orders.length ? "এই সার্চ বা ফিল্টারে কোনো অর্ডার নেই।" : "এখনও অর্ডার নেই।")}</p>
        {data.orders.length > 0 && <button type="button" className="button button-outline" onClick={() => {
          setFilter("all"); setQuery(""); setScope("all");
        }}>{t("ফিল্টার মুছুন")}</button>}
      </div>}
    </>}
    <dialog ref={dialog} className={styles.drawer} aria-labelledby="order-drawer-title" onClose={closeDetails}>
      {selected && <>
        <header className={styles.drawerHeader}>
          <div>
            <p>{t("অর্ডারের বিস্তারিত")}</p>
            <h2 id="order-drawer-title">{selected.id}</h2>
            <time dateTime={selected.createdAt}>{dateLabel(selected.createdAt)}</time>
          </div>
          <button ref={closeButton} type="button" className={styles.close} aria-label={t("বন্ধ করুন")} onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </header>
        <div className={styles.drawerBody}>
          <div className={styles.drawerBadges}><OrderBadges order={selected} /><PaymentBadge status={selected.paymentStatus} /></div>
          <section className={styles.detailSection}>
            <h3>{t("ডেলিভারির ঠিকানা")}</h3>
            <p><strong>{selected.customer.name}</strong></p>
            <a className={styles.phone} href={`tel:${selected.customer.phone}`}>{selected.customer.phone}</a>
            <p>{selected.customer.address}, {selected.customer.city}</p>
            {selected.customer.note && <p><strong>{t("ডেলিভারির নির্দেশনা")}</strong><br />{selected.customer.note}</p>}
          </section>
          <section className={styles.detailSection}>
            <h3>{t("অর্ডারের বই")}</h3>
            <ul className={styles.items}>{selected.items.map((item) => <li key={item.productId}>
              <div><strong>{item.title}</strong> <span>× {bn(item.quantity)}</span>
                {item.preorder && <small>{t("সম্ভাব্য পাঠানোর তারিখ")} · {dateLabel(item.dispatchDate || "")}</small>}
              </div>
              <strong>{money(item.price * item.quantity)}</strong>
            </li>)}</ul>
            {selected.preorderStatus && selected.preorderStatus !== "not-applicable" && <p>{t("প্রি-অর্ডার")} · {t(preorderLabels[selected.preorderStatus])}</p>}
            {selected.fulfillmentPolicy && <p>{t(selected.fulfillmentPolicy)}</p>}
          </section>
          <dl className={styles.totals}>
            <div><dt>{t("বইয়ের মোট মূল্য")}</dt><dd>{money(selected.subtotal)}</dd></div>
            {selected.coupon && <div><dt>{t("কুপনের ছাড়")} · {selected.coupon.code}</dt><dd>−{money(selected.coupon.discountMinor / 100)}</dd></div>}
            <div><dt>{t("ডেলিভারি চার্জ")}</dt><dd>{money(selected.delivery)}</dd></div>
            <div><dt>{t("সর্বমোট")}</dt><dd>{money(selected.total)}</dd></div>
          </dl>
        </div>
        <footer className={styles.drawerFooter}>
          {drawerFeedback && <p className={drawerFeedback.error ? "form-error" : styles.feedback} role={drawerFeedback.error ? "alert" : "status"}>{t(drawerFeedback.text)}</p>}
          {confirmCancel && canCancel ? <>
            <p>{t("অর্ডারটি বাতিল করলে বরাদ্দ করা বই স্টকে বা প্রি-অর্ডার কোটায় ফিরে যাবে।")}</p>
            <div className={styles.actions}>
              <button type="button" className="button button-outline" disabled={!!pendingAction} onClick={() => setConfirmCancel(false)}>{t("ফিরে যান")}</button>
              <button type="button" className={`button button-outline ${styles.cancel}`} disabled={!!pendingAction} onClick={() => void updateOrder(selected, "cancelled")}>{t("বাতিল নিশ্চিত করুন")}</button>
            </div>
          </> : (primary || canCancel) && <div className={styles.actions}>
            {primary && <button type="button" className="button" disabled={!!pendingAction} onClick={() => void updateOrder(selected, primary)}>
              <CheckCircle2 size={17} aria-hidden="true" />{t(pendingAction === primary ? "অপেক্ষা করুন…" : actionLabels[primary])}
            </button>}
            {canMarkReady && primary !== "ready" && <button type="button" className="button button-outline" disabled={!!pendingAction} onClick={() => void updateOrder(selected, "ready")}>{t(actionLabels.ready)}</button>}
            {canCancel && <button type="button" className={`button button-outline ${styles.cancel}`} disabled={!!pendingAction} onClick={() => {
              setFeedback(null); setConfirmCancel(true);
            }}>{t(actionLabels.cancelled)}</button>}
          </div>}
        </footer>
      </>}
    </dialog>
  </div>;
}
