"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { AdminPreferencesControls, AdminPreferencesProvider, useAdminPreferences } from "./admin-preferences";
import styles from "./admin-staff.module.css";

export function StaffInvitation({ token }: { token: string }) {
  return <AdminPreferencesProvider><AcceptInvitation token={token} /></AdminPreferencesProvider>;
}

function AcceptInvitation({ token }: { token: string }) {
  const { t, language, theme } = useAdminPreferences();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    if (values.get("password") !== values.get("confirmation")) { setError("পাসওয়ার্ড দুটি মেলেনি।"); return; }
    setBusy(true);
    setError("");
    try {
      await api("/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, password: values.get("password") }) });
      setAccepted(true);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="noor-admin" data-theme={theme} lang={language}>
    <section className={styles.invitePage}>
      <AdminPreferencesControls />
      <h1>{t("স্টাফ আমন্ত্রণ গ্রহণ")}</h1>
      {accepted ? <div role="status"><p>{t("অ্যাকাউন্ট প্রস্তুত। আপনার ইমেইল ও নতুন পাসওয়ার্ড দিয়ে লগইন করুন।")}</p><Link href="/account?next=/admin">{t("লগইন করুন")}</Link></div>
        : /^[a-f0-9]{64}$/.test(token) ? <form className={styles.form} onSubmit={submit}>
          <p>{t("নিজের পাসওয়ার্ড সেট করে আমন্ত্রণ গ্রহণ করুন।")}</p>
          <label>{t("নতুন পাসওয়ার্ড")}<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
          <label>{t("পাসওয়ার্ড আবার লিখুন")}<input type="password" name="confirmation" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
          {error && <p className="form-error" role="alert">{t(error)}</p>}
          <button type="submit" className="button" disabled={busy}>{t(busy ? "অপেক্ষা করুন…" : "আমন্ত্রণ গ্রহণ করুন")}</button>
        </form> : <p className="form-error" role="alert">{t("লিংকটি অকার্যকর বা মেয়াদ শেষ হয়েছে")}</p>}
    </section>
  </div>;
}
