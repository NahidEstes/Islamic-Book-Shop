"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, CheckCircle2, Star } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useStore } from "./store-provider";
import { api } from "@/lib/api";
import { bn } from "@/lib/catalog";
import type { AccountData, Review } from "@/lib/commerce-types";

export function StockAlert({ productId }: { productId: string }) {
  const { user } = useAuth(); const { notify } = useStore(); const [active, setActive] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (user) void api<AccountData>("/account").then((r) => setActive(r.subscriptions.some((s) => s.productId === productId && s.active))).catch(() => {}); }, [user, productId]);
  async function subscribe() { setBusy(true); setError(""); try { await api(`/account/subscriptions/${productId}`, { method: "PUT", body: JSON.stringify({ active: !active }) }); setActive(!active); notify(active ? "স্টক অ্যালার্ট বন্ধ হয়েছে" : "স্টকে এলে অ্যাকাউন্টে বার্তা পাবেন"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="stock-alert">{user ? <button className="button button-outline" disabled={busy} onClick={() => void subscribe()}><Bell size={17} />{active ? "স্টক অ্যালার্ট বন্ধ করুন" : "স্টকে এলে জানাবেন"}</button> : <Link className="button button-outline" href="/account"><Bell size={17} /> স্টক অ্যালার্ট পেতে লগইন করুন</Link>}<p className="muted small">অ্যাকাউন্টে নোটিফিকেশন পাবেন। ইমেইলের জন্য যাচাইকৃত ঠিকানা ও সংযুক্ত ইমেইল সেবা প্রয়োজন।</p>{error && <p className="error-text" role="alert">{error}</p>}</div>;
}
type ReviewsResponse = { reviews: Omit<Review, "userId">[]; ownReview: Review | null; eligible: boolean };
export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth(); const { notify } = useStore(); const [data, setData] = useState<ReviewsResponse | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { try { setData(await api<ReviewsResponse>(`/books/${productId}/reviews`)); setError(""); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void load(); }, [productId, user?.id]);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget); try { await api(`/books/${productId}/reviews`, { method: "POST", body: JSON.stringify({ rating: Number(f.get("rating")), text: f.get("text") }) }); await load(); notify("মতামতটি পর্যালোচনার জন্য জমা হয়েছে"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="community-section"><div className="section-heading"><div><span className="eyebrow">পাঠকের অভিজ্ঞতা</span><h2>যাচাইকৃত ক্রেতার মতামত</h2></div><Star size={25} /></div>{error && <p role="alert" className="form-error">{error}</p>}{!data ? <p className="muted">রিভিউ লোড হচ্ছে...</p> : <><div className="review-list">{data.reviews.length ? data.reviews.map((r) => <article className="panel reader-review" key={r.id}><div><strong>{r.displayName}</strong><span className="verified-label"><CheckCircle2 size={14} /> যাচাইকৃত ক্রেতা</span></div><span className="rating-stars" aria-label={`${bn(r.rating)} তারকা`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span><p>{r.text}</p><small className="muted">{new Date(r.updatedAt).toLocaleDateString("bn-BD", { timeZone: "Asia/Riyadh" })}</small></article>) : <div className="panel muted">এখনও কোনো অনুমোদিত রিভিউ নেই।</div>}</div>{data.ownReview && <p className="notice">আপনার রিভিউয়ের অবস্থা: {({ pending: "পর্যালোচনাধীন", approved: "প্রকাশিত", rejected: "প্রকাশের জন্য গৃহীত হয়নি", hidden: "লুকানো" })[data.ownReview.status]}</p>}{data.eligible ? <form className="panel review-form" key={data.ownReview?.updatedAt || "new"} onSubmit={submit}><h3>{data.ownReview ? "আপনার মতামত সম্পাদনা" : "আপনার মতামত দিন"}</h3><label>রেটিং<select name="rating" defaultValue={data.ownReview?.rating || 5}>{[5, 4, 3, 2, 1].map((n) => <option value={n} key={n}>{bn(n)} তারকা</option>)}</select></label><label>বইটি পড়ে আপনার অভিজ্ঞতা<textarea name="text" rows={4} minLength={15} maxLength={2000} required defaultValue={data.ownReview?.text || ""} /></label><p className="muted small">প্রকাশের আগে পর্যালোচনা করা হবে। সম্পাদিত মতামতও আবার যাচাই করা হয়।</p><button className="button" disabled={busy}>মতামত জমা দিন</button></form> : <p className="muted small review-eligibility">রিভিউ দিতে এই অ্যাকাউন্টে কেনা বইয়ের বাস্তব অর্ডার ডেলিভারি সম্পন্ন হতে হবে। ডেমো অর্ডার রিভিউয়ের জন্য যোগ্য নয়। {!user && <Link className="text-link" href="/account">লগইন করুন</Link>}</p>}</>}</section>;
}
