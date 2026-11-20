"use client";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, PackageSearch, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { money, bn } from "@/lib/catalog";
import { statusLabels, paymentStatusLabels, type Order } from "@/lib/types";
export function OrderTracker() {
  const params = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setOrder(null); setBusy(true);
    const data = new FormData(e.currentTarget);
    try { const r = await api<{ order: Order }>("/orders/lookup", { method: "POST", body: JSON.stringify({ orderId: data.get("orderId"), phone: data.get("phone") }) }); setOrder(r.order); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="container page-content tracking-page"><div className="page-heading"><span className="eyebrow">আপনার বই কোথায়</span><h1>অর্ডারের খোঁজ রাখুন</h1><p>অর্ডার নম্বর ও অর্ডারে দেওয়া মোবাইল নম্বর দিয়ে অগ্রগতি দেখুন।</p></div><div className="tracking-layout"><form className="panel tracking-form" onSubmit={submit}><PackageSearch size={34} /><h2>আপনার অর্ডার খুঁজুন</h2><label>অর্ডার নম্বর<input name="orderId" required defaultValue={params.get("id") || ""} placeholder="NOOR-..." maxLength={60} /></label><label>মোবাইল নম্বর<input name="phone" type="tel" required placeholder="01XXXXXXXXX" maxLength={20} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "খোঁজা হচ্ছে..." : "অর্ডার দেখুন"}</button></form>
    {order ? <section className="panel tracked-order"><div className="order-status"><Truck size={28} /><div><span className="eyebrow">{order.demo ? "ডেমো অর্ডার" : "অর্ডারের অবস্থা"}</span><h2>{statusLabels[order.status]}</h2></div></div><p className="order-id">{order.id}</p><p className="muted small">{new Date(order.createdAt).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}</p>{order.demo && <p className="notice">এটি পরীক্ষামূলক অর্ডার। ডেলিভারি করা হবে না।</p>}<div className="checkout-line-items">{order.items.map((i) => <div key={i.productId}><span>{i.title} × {bn(i.quantity)}</span><strong>{money(i.price * i.quantity)}</strong></div>)}</div><div className="summary-row"><span>ডেলিভারি</span><strong>{money(order.delivery)}</strong></div>{order.coupon && <div className="summary-row"><span>কুপনের ছাড় · {order.coupon.code}</span><strong>−{money(order.coupon.discountMinor / 100)}</strong></div>}<div className="summary-total"><span>সর্বমোট</span><strong>{money(order.total)}</strong></div><p>ক্যাশ অন ডেলিভারি · {paymentStatusLabels[order.paymentStatus]}</p>{order.preorderStatus === "awaiting-release" && <p className="notice">প্রি-অর্ডার প্রকাশের অপেক্ষায়। {order.fulfillmentPolicy}</p>}<p className="muted small">ডেলিভারি ঠিকানা: {order.customer.address}, {order.customer.city}</p></section> : <div className="tracking-illustration"><div><PackageSearch size={75} strokeWidth={1} /></div><h2>অর্ডার থেকে আপনার দোরগোড়ায়</h2><p>বইয়ের যাত্রার প্রতিটি ধাপ জানতে পাশে তথ্য দিন।</p></div>}</div></div>;
}
