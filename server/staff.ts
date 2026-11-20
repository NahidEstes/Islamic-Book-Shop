import { randomBytes } from "node:crypto";
import type { PublicStaffInvitation, ShopData, StaffDetail, StaffInvitation, StaffMember, StaffOverview, StaffRole, User } from "../lib/commerce-types";
import { hashPassword, tokenHash } from "./auth";
import { audit } from "./commerce";
import type { Mailer } from "./mail";
import { id, StoreError, type Store } from "./store";

function member(user: User, data: ShopData): StaffMember {
  const { id, name, email, role, disabled, createdAt, lastLoginAt, emailVerified } = user;
  const activeSessions = data.sessions.filter((session) => session.userId === id && Date.parse(session.expiresAt) > Date.now()).length;
  return { id, name, email, role, disabled, createdAt, lastLoginAt, emailVerified, activeSessions };
}

function publicInvitation(invite: StaffInvitation, data: ShopData): PublicStaffInvitation {
  const { tokenHash: _secret, ...safe } = invite;
  const mail = data.outbox.findLast((message) => message.userId === invite.id && message.type === "invite");
  const status = invite.acceptedAt ? "accepted" : Date.parse(invite.expiresAt) > Date.now() ? "pending" : "expired";
  return { ...safe, status, deliveryStatus: mail?.status };
}

export class StaffService {
  constructor(private store: Store, private mailer: Mailer, private appUrl: string) {}

  async overview(): Promise<StaffOverview> {
    const data = await this.store.snapshot();
    return {
      users: data.users.filter((user) => user.role !== "customer").map((user) => member(user, data)),
      invitations: data.staffInvitations.map((invite) => publicInvitation(invite, data)),
      emailAvailable: this.mailer.available,
    };
  }

  async customers(query: string) {
    const data = await this.store.snapshot();
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return { users: [] };
    const users = data.users.filter((user) => user.role === "customer" && (user.name.toLowerCase().includes(needle) || user.email.includes(needle)));
    return { users: users.slice(0, 20).map((user) => member(user, data)), hasMore: users.length > 20 };
  }

  async detail(userId: string): Promise<StaffDetail> {
    const data = await this.store.snapshot();
    const user = data.users.find((item) => item.id === userId);
    if (!user) throw new StoreError("অ্যাকাউন্ট পাওয়া যায়নি", 404);
    const names = new Map(data.users.map((item) => [item.id, item.name]));
    return {
      user: member(user, data),
      isLastOwner: user.role === "owner" && !user.disabled && data.users.filter((item) => item.role === "owner" && !item.disabled).length === 1,
      activity: data.audit.filter((entry) => entry.target === userId || entry.actor === userId).slice(-100).reverse().map((entry) => ({
        ...entry, actorName: names.get(entry.actor) || entry.actor, targetName: names.get(entry.target) || entry.target,
      })),
    };
  }

  revokeSessions(userId: string, actor: string) {
    return this.store.transaction((data) => {
      const user = data.users.find((item) => item.id === userId && item.role !== "customer");
      if (!user) throw new StoreError("কর্মী পাওয়া যায়নি", 404);
      data.sessions = data.sessions.filter((session) => session.userId !== userId);
      user.authVersion = (user.authVersion || 0) + 1;
      audit(data, actor, "staff.sessions-revoked", userId);
      return { ok: true };
    });
  }

  invite(input: { name: string; email: string; role: StaffRole }, actor: string, invitationId?: string) {
    if (!this.mailer.available) throw new StoreError("ইমেইল সেবা সংযুক্ত নয়। সরাসরি অ্যাকাউন্ট তৈরি করুন।", 503);
    return this.store.transaction((data) => {
      const existing = invitationId
        ? data.staffInvitations.find((invite) => invite.id === invitationId)
        : data.staffInvitations.find((invite) => invite.email === input.email);
      if (invitationId && !existing) throw new StoreError("আমন্ত্রণ পাওয়া যায়নি", 404);
      if (!invitationId && existing) throw new StoreError("এই ইমেইলে আমন্ত্রণ আছে। আমন্ত্রণের তালিকা থেকে আবার পাঠান।", 409);
      if (existing?.acceptedAt) throw new StoreError("আমন্ত্রণটি ইতিমধ্যে গ্রহণ করা হয়েছে", 409);
      const email = existing?.email || input.email;
      if (data.users.some((user) => user.email === email)) throw new StoreError("এই ইমেইলে অ্যাকাউন্ট আছে; বিদ্যমান অ্যাকাউন্টের ভূমিকা সম্পাদনা করুন", 409);
      const token = randomBytes(32).toString("hex");
      const now = new Date().toISOString();
      const invite: StaffInvitation = {
        id: existing?.id || id("invite"), name: existing?.name || input.name, email,
        role: existing?.role || input.role, tokenHash: tokenHash(token), createdAt: now,
        createdBy: actor, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      };
      if (existing) Object.assign(existing, invite);
      else data.staffInvitations.push(invite);
      for (const mail of data.outbox) {
        if (mail.userId === invite.id && mail.type === "invite" && mail.status !== "sent") {
          mail.status = "failed";
          mail.text = "Replaced staff invitation";
          mail.expiresAt = now;
        }
      }
      data.outbox.push({
        id: id("mail"), userId: invite.id, to: invite.email, type: "invite",
        subject: "Noor Bookshop — Staff invitation",
        text: `You have been invited to Noor Bookshop. Set your password to accept your staff invitation:\n${this.appUrl}/account/invite?token=${token}\nThis link expires in 48 hours.`,
        status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now, expiresAt: invite.expiresAt,
      });
      audit(data, actor, existing ? "staff.invitation-resent" : "staff.invited", invite.id);
      return { invitation: publicInvitation(invite, data) };
    });
  }

  async resend(invitationId: string, actor: string) {
    const data = await this.store.snapshot();
    const invite = data.staffInvitations.find((item) => item.id === invitationId);
    if (!invite) throw new StoreError("আমন্ত্রণ পাওয়া যায়নি", 404);
    return this.invite(invite, actor, invitationId);
  }

  async accept(token: string, password: string) {
    const valid = (invite: StaffInvitation) => invite.tokenHash === tokenHash(token) && !invite.acceptedAt && Date.parse(invite.expiresAt) > Date.now();
    const snapshot = await this.store.snapshot();
    if (!snapshot.staffInvitations.some(valid)) throw new StoreError("লিংকটি অকার্যকর বা মেয়াদ শেষ হয়েছে", 400);
    const passwordHash = await hashPassword(password);
    return this.store.transaction((data) => {
      const invite = data.staffInvitations.find(valid);
      if (!invite) throw new StoreError("লিংকটি অকার্যকর বা মেয়াদ শেষ হয়েছে", 400);
      if (data.users.some((user) => user.email === invite.email)) throw new StoreError("এই ইমেইলে অ্যাকাউন্ট আছে; মালিকের সঙ্গে যোগাযোগ করুন।", 409);
      const now = new Date().toISOString();
      const user: User = {
        id: id("user"), name: invite.name, email: invite.email, role: invite.role, passwordHash,
        disabled: false, emailVerified: true, addresses: [], createdAt: now,
      };
      data.users.push(user);
      invite.acceptedAt = now;
      invite.userId = user.id;
      // The token is single-use, and consumed invitation links cannot be requeued.
      invite.tokenHash = "";
      for (const mail of data.outbox) {
        if (mail.userId === invite.id && mail.type === "invite") {
          mail.text = "Accepted staff invitation; secret link removed.";
          if (mail.status !== "sent") mail.status = "failed";
          mail.expiresAt = now;
        }
      }
      audit(data, invite.createdBy, "staff.created-from-invitation", user.id);
      audit(data, user.id, "staff.invitation-accepted", user.id);
      return { ok: true };
    });
  }
}
