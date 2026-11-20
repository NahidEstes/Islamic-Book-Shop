import nodemailer from "nodemailer";
import type { OutboxMessage } from "../lib/commerce-types";
import type { Store } from "./store";
export interface Mailer { available: boolean; send(message: OutboxMessage): Promise<void> }
export function smtpMailer(): Mailer {
  const available = !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
  const transporter = available ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", requireTLS: process.env.SMTP_SECURE !== "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined, connectionTimeout: 10000, socketTimeout: 20000 }) : null;
  return { available, async send(message) {
    if (!transporter) throw new Error("Email provider is not configured");
    const result = await transporter.sendMail({ from: process.env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text, messageId: `<${message.id}@noor-bookshop.local>` });
    if (!result.accepted?.length || result.rejected?.length) throw new Error("Email provider did not accept the message");
  } };
}
export async function flushOutbox(store: Store, mailer: Mailer) {
  if (!mailer.available) return { sent: 0, available: false };
  let sent = 0;
  // Lease each message in storage so concurrent workers cannot send it simultaneously.
  for (let index = 0; index < 20; index++) {
    const claimed = await store.transaction((d) => {
      const now = Date.now();
      for (const m of d.outbox) if (m.expiresAt && Date.parse(m.expiresAt) <= now && m.status !== "sent") { m.status = "failed"; m.text = "Expired identity link"; }
      const m = d.outbox.find((m) => m.attempts < 5 && (!m.expiresAt || Date.parse(m.expiresAt) > now) && ((["pending", "unavailable"].includes(m.status) && Date.parse(m.nextAttemptAt) <= now) || (m.status === "sending" && Date.parse(m.leaseUntil || "0") <= now)));
      if (!m) return null;
      m.status = "sending"; m.attempts++; m.leaseUntil = new Date(now + 120000).toISOString(); return structuredClone(m);
    });
    if (!claimed) break;
    let success = false;
    try { await mailer.send(claimed); success = true; sent++; } catch { /* Retry without logging credentials, recipients or reset links. */ }
    await store.transaction((d) => {
      const m = d.outbox.find((m) => m.id === claimed.id); if (!m || m.status !== "sending") return;
      m.status = success ? "sent" : m.attempts >= 5 ? "failed" : "pending";
      m.nextAttemptAt = new Date(Date.now() + 60000 * 2 ** m.attempts).toISOString(); delete m.leaseUntil;
      if (success && (m.type === "reset" || m.type === "verify" || m.type === "invite")) m.text = "Identity email accepted by provider; secret link removed.";
    });
  }
  return { sent, available: true };
}
