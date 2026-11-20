"use client";

import { Check, ChevronRight, Eye, EyeOff, Mail, Plus, Search, ShieldCheck, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { roleLabels, rolePermissions, type Role, type StaffDetail, type StaffMember, type StaffOverview, type StaffRole } from "@/lib/commerce-types";
import { adminSections } from "@/lib/admin-routes";
import { useAdmin, useAdminResource, AdminResourceState } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import { useAuth } from "./auth-provider";
import styles from "./admin-staff.module.css";

const staffRoles: StaffRole[] = ["catalog", "orders", "manager", "owner"];
const invitationLabels = { pending: "অপেক্ষমাণ", accepted: "গৃহীত", expired: "মেয়াদোত্তীর্ণ" };
const deliveryLabels = { pending: "কিউতে আছে", unavailable: "ইমেইল সেবা নেই", sending: "পাঠানো হচ্ছে", sent: "ইমেইল সেবা গ্রহণ করেছে", failed: "ইমেইল পাঠানো যায়নি" };

function StaffPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useAdminPreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return <dialog ref={dialog} className={styles.drawer} aria-label={title} onClose={onClose}>
    <header className={styles.panelHeader}>
      <h2>{title}</h2>
      <button type="button" className={styles.close} aria-label={t("বন্ধ করুন")} onClick={() => dialog.current?.close()}><X size={21} aria-hidden="true" /></button>
    </header>
    <div className={styles.panelBody}>{children}</div>
  </dialog>;
}

function Permissions({ role, title = "এই ভূমিকার অনুমতি" }: { role: Role; title?: string }) {
  const { t } = useAdminPreferences();
  return <section className={styles.permissions}>
    <h3><ShieldCheck size={17} aria-hidden="true" />{t(title)}</h3>
    {rolePermissions[role].length ? <ul>{adminSections.filter((section) => rolePermissions[role].includes(section.permission)).map((section) =>
      <li key={section.slug}><Check size={14} aria-hidden="true" />{t(section.label)}</li>)}</ul> : <p>{t("প্রশাসনিক অনুমতি নেই")}</p>}
  </section>;
}

function RoleSelect({ value, onChange, customer = false, disabled = false }: { value: Role; onChange: (role: Role) => void; customer?: boolean; disabled?: boolean }) {
  const { t } = useAdminPreferences();
  const options: Role[] = customer ? [...staffRoles, "customer"] : staffRoles;
  return <label>{t("ভূমিকা")}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as Role)}>
    {options.map((role) => <option value={role} key={role}>{t(roleLabels[role])}</option>)}
  </select></label>;
}

function AddStaff({ emailAvailable, onCreated, onSelect }: { emailAvailable: boolean; onCreated: () => Promise<void>; onSelect: (user: StaffMember) => void }) {
  const { t } = useAdminPreferences();
  const { request } = useAdmin();
  const [mode, setMode] = useState<"invite" | "direct" | "existing">(emailAvailable ? "invite" : "direct");
  const [role, setRole] = useState<Role>("catalog");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setMessage(null);
    try {
      await request(mode === "invite" ? "/staff/invitations" : "/staff", {
        method: "POST", body: JSON.stringify({
          name: values.get("name"), email: values.get("email"), role,
          ...(mode === "direct" ? { password: values.get("password") } : {}),
        }),
      });
      form.reset();
      setMessage({ text: mode === "invite" ? "আমন্ত্রণ ইমেইল কিউতে রাখা হয়েছে। লিংকের মেয়াদ ৪৮ ঘণ্টা।" : "কর্মীর অ্যাকাউন্ট তৈরি হয়েছে" });
      await onCreated();
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return <>
    {!emailAvailable && <p className={styles.notice}>{t("ইমেইল সেবা সংযুক্ত নয়। সরাসরি অ্যাকাউন্ট তৈরি করুন।")}</p>}
    <div className={styles.tabs} role="group" aria-label={t("কর্মী যোগ করার পদ্ধতি")}>
      {([["invite", "ইমেইলে আমন্ত্রণ"], ["direct", "অ্যাকাউন্ট তৈরি"], ["existing", "বিদ্যমান অ্যাকাউন্ট"]] as const).map(([value, label]) =>
        <button type="button" key={value} disabled={busy || (value === "invite" && !emailAvailable)} aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(null); }}>{t(label)}</button>)}
    </div>
    {mode === "existing" ? <CustomerLookup onSelect={onSelect} /> : <form className={styles.form} onSubmit={submit}>
      <label>{t("নাম")}<input name="name" required minLength={2} maxLength={100} autoComplete="name" /></label>
      <label>{t("ইমেইল")}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      {mode === "direct" && <label>{t("প্রাথমিক পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর)")}
        <div className={styles.password}>
          <input name="password" type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
          <button type="button" aria-label={t(showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান")} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>}
      <RoleSelect value={role} onChange={setRole} disabled={busy} />
      <Permissions role={role} />
      {message && <p className={message.error ? "form-error" : styles.success} role={message.error ? "alert" : "status"}>{t(message.text)}</p>}
      <button type="submit" className="button" disabled={busy}>{mode === "invite" ? <Mail size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{t(busy ? "অপেক্ষা করুন…" : mode === "invite" ? "আমন্ত্রণ পাঠান" : "কর্মী তৈরি করুন")}</button>
    </form>}
  </>;
}

function CustomerLookup({ onSelect }: { onSelect: (user: StaffMember) => void }) {
  const { t } = useAdminPreferences();
  const { request } = useAdmin();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ users: StaffMember[]; hasMore?: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setResults(null);
    setError("");
    if (query.trim().length < 2) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void request<{ users: StaffMember[]; hasMore?: boolean }>(`/staff/customers?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((value) => { if (!controller.signal.aborted) setResults(value); })
        .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, request]);
  return <div className={styles.lookup}>
    <label>{t("নাম বা ইমেইল দিয়ে গ্রাহক খুঁজুন")}<input type="search" value={query} maxLength={254} onChange={(event) => setQuery(event.target.value)} /></label>
    <p className={styles.muted}>{t("অন্তত ২ অক্ষর লিখুন।")}</p>
    <AdminResourceState error={error} loading={loading} />
    {results && <div role="status">{!results.users.length && <p>{t("কোনো অ্যাকাউন্ট পাওয়া যায়নি।")}</p>}{results.hasMore && <p>{t("প্রথম ২০টি ফলাফল। সার্চ আরও নির্দিষ্ট করুন।")}</p>}</div>}
    {results?.users.map((user) => <button className={styles.customerResult} type="button" key={user.id} onClick={() => onSelect(user)}>
      <span><strong>{user.name}</strong><small>{user.email}</small></span><ChevronRight size={18} aria-hidden="true" />
    </button>)}
  </div>;
}

function StaffEdit({ detail, onSaved }: { detail: StaffDetail; onSaved: () => Promise<void> }) {
  const { t } = useAdminPreferences();
  const { request } = useAdmin();
  const { user: currentUser, refreshAuth } = useAuth();
  const baseline = detail.user;
  const [role, setRole] = useState<Role>(baseline.role === "customer" ? "catalog" : baseline.role);
  const [disabled, setDisabled] = useState(baseline.disabled);
  const [confirmation, setConfirmation] = useState<"permissions" | "sessions" | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const changed = role !== baseline.role || disabled !== baseline.disabled;
  const blocked = detail.isLastOwner && (role !== "owner" || disabled);
  const before = rolePermissions[baseline.role];
  const after = disabled ? [] : rolePermissions[role];
  const effectiveBefore = baseline.disabled ? [] : before;

  async function save() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const path = `/staff/${encodeURIComponent(baseline.id)}`;
      if (confirmation === "sessions") await request(`${path}/revoke-sessions`, { method: "POST", body: "{}" });
      else await request(path, { method: "PATCH", body: JSON.stringify({ role, disabled, expected: { role: baseline.role, disabled: baseline.disabled } }) });
      setFeedback({ text: confirmation === "sessions" ? "সব সক্রিয় সেশন বন্ধ হয়েছে।" : "ভূমিকা ও অনুমতি আপডেট হয়েছে" });
      setConfirmation(null);
      if (currentUser?.id === baseline.id) await refreshAuth();
      await onSaved();
    } catch (error) {
      setFeedback({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.edit}>
    <h3>{t("ভূমিকা ও অনুমতি")}</h3>
    {detail.isLastOwner && <p className={styles.notice}>{t("সর্বশেষ সক্রিয় মালিককে নিষ্ক্রিয় বা সরানো যাবে না")}</p>}
    <RoleSelect value={role} customer onChange={(value) => { setRole(value); setConfirmation(null); }} disabled={busy || detail.isLastOwner} />
    <label className={styles.checkbox}><input type="checkbox" checked={disabled} disabled={busy || detail.isLastOwner} onChange={(event) => { setDisabled(event.target.checked); setConfirmation(null); }} />{t("নিষ্ক্রিয়")}</label>
    <Permissions role={disabled ? "customer" : role} />
    {confirmation === "permissions" && <div className={styles.review}>
      <h3>{t("পরিবর্তন পর্যালোচনা")}</h3>
      <p>{t(roleLabels[baseline.role])} → {t(roleLabels[role])}</p>
      {disabled !== baseline.disabled && <p>{t(baseline.disabled ? "নিষ্ক্রিয়" : "সক্রিয়")} → {t(disabled ? "নিষ্ক্রিয়" : "সক্রিয়")}</p>}
      {adminSections.filter((section) => after.includes(section.permission) && !effectiveBefore.includes(section.permission)).map((section) => <p key={section.slug}>+ {t(section.label)}</p>)}
      {adminSections.filter((section) => effectiveBefore.includes(section.permission) && !after.includes(section.permission)).map((section) => <p key={section.slug}>− {t(section.label)}</p>)}
      <p>{t("সেভ করলে সব বর্তমান সেশন বন্ধ হবে। কর্মীকে আবার লগইন করতে হবে।")}</p>
    </div>}
    {confirmation === "sessions" && <p className={styles.notice}>{t("এই সদস্যের সব সক্রিয় সেশন বন্ধ হবে। আবার লগইন করা যাবে।")}</p>}
    {feedback && <p className={feedback.error ? "form-error" : styles.success} role={feedback.error ? "alert" : "status"}>{t(feedback.text)}</p>}
    {confirmation ? <div className={styles.actions}>
      <button type="button" className="button" disabled={busy || blocked} onClick={() => void save()}>{t(busy ? "অপেক্ষা করুন…" : "নিশ্চিত করুন")}</button>
      <button type="button" className="button button-outline" disabled={busy} onClick={() => setConfirmation(null)}>{t("ফিরে যান")}</button>
    </div> : <div className={styles.actions}>
      <button type="button" className="button" disabled={busy || !changed || blocked} onClick={() => setConfirmation("permissions")}>{t("পরিবর্তন পর্যালোচনা")}</button>
      {baseline.role !== "customer" && <button type="button" className="button button-outline" disabled={busy || !baseline.activeSessions} onClick={() => setConfirmation("sessions")}>{t("সব ডিভাইস থেকে লগআউট")}</button>}
    </div>}
  </section>;
}

const activityLabels: Record<string, string> = {
  "staff.create": "কর্মীর অ্যাকাউন্ট তৈরি",
  "staff.permissions": "ভূমিকা ও অনুমতি পরিবর্তন",
  "staff.sessions-revoked": "সব সেশন বন্ধ",
  "staff.created-from-invitation": "আমন্ত্রণ থেকে অ্যাকাউন্ট তৈরি",
  "staff.invitation-accepted": "আমন্ত্রণ গ্রহণ",
};

function StaffDetails({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> }) {
  const { t, bn, dateTime, dateLabel } = useAdminPreferences();
  const { data, error, reload } = useAdminResource<StaffDetail>(`/staff/${encodeURIComponent(userId)}`);
  const [saved, setSaved] = useState(false);
  async function updated() {
    await Promise.all([reload(), onSaved()]);
    setSaved(true);
  }
  return <>
    <AdminResourceState error={error} loading={!data} />
    {data && <>
      {saved && <p className={styles.success} role="status">{t("কর্মীর তথ্য আপডেট হয়েছে।")}</p>}
      <div className={styles.profile}>
        <h3>{data.user.name}</h3><p>{data.user.email}</p>
        <dl>
          <div><dt>{t("যোগদানের তারিখ")}</dt><dd>{dateLabel(data.user.createdAt)}</dd></div>
          <div><dt>{t("সর্বশেষ লগইন")}</dt><dd>{data.user.lastLoginAt ? dateTime(data.user.lastLoginAt) : t("রেকর্ড নেই")}</dd></div>
          <div><dt>{t("সক্রিয় সেশন")}</dt><dd>{bn(data.user.activeSessions)}</dd></div>
        </dl>
      </div>
      <StaffEdit key={`${data.user.role}-${data.user.disabled}-${data.user.activeSessions}`} detail={data} onSaved={updated} />
      <section className={styles.activity}>
        <h3>{t("সাম্প্রতিক কার্যকলাপ")}</h3>
        {!data.activity.length && <p>{t("এখনও কোনো কার্যকলাপ নেই।")}</p>}
        <ol>{data.activity.map((entry) => <li key={entry.id}>
          <strong>{t(activityLabels[entry.action] || entry.action)}</strong>
          <p>{entry.actor === "bootstrap-owner" ? t("মালিকের কী") : entry.actorName} · {entry.targetName}</p>
          {entry.change && <p>{t(roleLabels[entry.change.beforeRole])} → {t(roleLabels[entry.change.afterRole])}
            {entry.change.beforeDisabled !== entry.change.afterDisabled && <> · {t(entry.change.afterDisabled ? "নিষ্ক্রিয়" : "সক্রিয়")}</>}</p>}
          <time dateTime={entry.at}>{dateTime(entry.at)}</time>
        </li>)}</ol>
      </section>
    </>}
  </>;
}

export function AdminStaff() {
  const { t, bn, dateLabel } = useAdminPreferences();
  const { data, error, reload } = useAdminResource<StaffOverview>("/staff");
  const { request } = useAdmin();
  const [tab, setTab] = useState<"staff" | "invitations">("staff");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [panel, setPanel] = useState<"add" | StaffMember | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = (name: string, email: string, memberRole: Role) => (!needle || name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle)) && (role === "all" || role === memberRole);
  const users = data?.users.filter((user) => matches(user.name, user.email, user.role) && (status === "all" || (status === "inactive") === user.disabled)) ?? [];
  const invitations = data?.invitations.filter((invite) => matches(invite.name, invite.email, invite.role) && (status === "all" || status === invite.status)) ?? [];

  async function resend(invitationId: string) {
    setResending(invitationId);
    setMessage(null);
    try {
      await request(`/staff/invitations/${encodeURIComponent(invitationId)}/resend`, { method: "POST", body: "{}" });
      await reload();
      setMessage({ text: "আমন্ত্রণ ইমেইল কিউতে রাখা হয়েছে। লিংকের মেয়াদ ৪৮ ঘণ্টা।" });
    } catch (error) { setMessage({ text: (error as Error).message, error: true }); }
    finally { setResending(null); }
  }

  return <div className={styles.workspace}>
    <header className={`signature-heading ${styles.heading}`}>
      <h1>{t("কর্মী ও অনুমতি")}</h1>
      <button type="button" className="button" disabled={!data} onClick={() => setPanel("add")}><Plus size={18} aria-hidden="true" />{t("নতুন কর্মী")}</button>
    </header>
    <AdminResourceState error={error} loading={!data} />
    {data && <>
      <div className={styles.stats}>
        {[[t("মোট স্টাফ"), data.users.length], [t("সক্রিয়"), data.users.filter((user) => !user.disabled).length], [t("নিষ্ক্রিয়"), data.users.filter((user) => user.disabled).length]].map(([label, value]) =>
          <div className="panel" key={label}><span>{label}</span><strong>{bn(Number(value))}</strong></div>)}
      </div>
      <div className={styles.toolbar}>
        <label className={styles.search}><span className="sr-only">{t("স্টাফ খুঁজুন")}</span><Search size={18} aria-hidden="true" />
          <input type="search" placeholder={t("নাম বা ইমেইল দিয়ে খুঁজুন")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>{t("ভূমিকা")}<select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="all">{t("সব ভূমিকা")}</option>{staffRoles.map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
        </select></label>
        <label>{t("অবস্থা")}<select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t("সব অবস্থা")}</option>
          {tab === "staff" ? <><option value="active">{t("সক্রিয়")}</option><option value="inactive">{t("নিষ্ক্রিয়")}</option></>
            : Object.entries(invitationLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select></label>
      </div>
      <div className={styles.tabs} role="group" aria-label={t("স্টাফ পেজের বিভাগ")}>
        <button type="button" aria-pressed={tab === "staff"} onClick={() => { setTab("staff"); setStatus("all"); }}><Users size={16} aria-hidden="true" />{t("স্টাফ")}</button>
        <button type="button" aria-pressed={tab === "invitations"} onClick={() => { setTab("invitations"); setStatus("all"); }}><Mail size={16} aria-hidden="true" />{t("আমন্ত্রণ")}</button>
      </div>
      {message && <p className={message.error ? "form-error" : styles.success} role={message.error ? "alert" : "status"}>{t(message.text)}</p>}
      <p className={styles.count} role="status">{t("ফলাফল")} · {bn(tab === "staff" ? users.length : invitations.length)}</p>
      <div className={`panel ${styles.tablePanel}`} tabIndex={0} role="region" aria-label={t("স্টাফ তালিকা")}>
        <table className={styles.table}>
          <thead><tr>{[t("নাম"), t("ভূমিকা"), t("অবস্থা"), t(tab === "staff" ? "যোগদানের তারিখ" : "মেয়াদ"), t(tab === "staff" ? "সক্রিয় সেশন" : "ইমেইল")].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{tab === "staff" ? users.map((user) => <tr key={user.id}>
            <th scope="row"><button className={styles.memberLink} type="button" aria-haspopup="dialog" onClick={() => setPanel(user)}>{user.name}<ChevronRight size={15} aria-hidden="true" /></button><small>{user.email}</small></th>
            <td>{t(roleLabels[user.role])}</td><td><span className={styles.badge} data-state={user.disabled ? "inactive" : "active"}>{t(user.disabled ? "নিষ্ক্রিয়" : "সক্রিয়")}</span></td>
            <td>{dateLabel(user.createdAt)}</td><td>{bn(user.activeSessions)}</td>
          </tr>) : invitations.map((invite) => <tr key={invite.id}>
            <th scope="row">{invite.name}<small>{invite.email}</small></th><td>{t(roleLabels[invite.role])}</td>
            <td><span className={styles.badge} data-state={invite.status}>{t(invitationLabels[invite.status])}</span></td>
            <td>{dateLabel(invite.expiresAt)}</td><td><small>{invite.deliveryStatus && t(deliveryLabels[invite.deliveryStatus])}</small>
              {invite.status !== "accepted" && <button className={styles.memberLink} type="button" disabled={!data.emailAvailable || !!resending} onClick={() => void resend(invite.id)}>{t(resending === invite.id ? "অপেক্ষা করুন…" : "আবার আমন্ত্রণ পাঠান")}</button>}
            </td>
          </tr>)}</tbody>
        </table>
        {!(tab === "staff" ? users.length : invitations.length) && <p className={styles.empty}>{t("এই ফিল্টারে কোনো ফলাফল নেই।")}</p>}
      </div>
      {tab === "invitations" && !data.emailAvailable && <p className={styles.notice}>{t("ইমেইল সেবা সংযুক্ত নয়। সরাসরি অ্যাকাউন্ট তৈরি করুন।")}</p>}
    </>}
    {panel && <StaffPanel title={t(panel === "add" ? "নতুন কর্মী" : "কর্মীর বিস্তারিত")} onClose={() => setPanel(null)}>
      {panel === "add" ? <AddStaff emailAvailable={data?.emailAvailable ?? false} onCreated={reload} onSelect={setPanel} />
        : <StaffDetails key={panel.id} userId={panel.id} onSaved={reload} />}
    </StaffPanel>}
  </div>;
}
