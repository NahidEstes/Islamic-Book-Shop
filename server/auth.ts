import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PublicUser, User } from "../lib/commerce-types";
import { id, StoreError, type Store } from "./store";

const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`; }
export async function verifyPassword(password: string, encoded?: string) {
  const parts = encoded?.split(":"); const salt = parts?.[1] || "00000000000000000000000000000000";
  const actual = await derive(password, salt); const expected = Buffer.from(parts?.[2] || "00".repeat(64), "hex");
  return !!encoded && expected.length === actual.length && timingSafeEqual(actual, expected);
}
export const publicUser = (user: User): PublicUser => { const { passwordHash: _secret, authVersion: _version, ...safe } = user; return safe; };
export class AuthService {
  constructor(private store: Store) {}
  async register(input: { name: string; email: string; password: string }) {
    const passwordHash = await hashPassword(input.password);
    return this.store.transaction((d) => {
      if (d.users.some((u) => u.email === input.email)) throw new StoreError("এই ইমেইলে অ্যাকাউন্ট আছে। লগইন বা পাসওয়ার্ড পুনরুদ্ধার করুন।", 409);
      const user: User = { id: id("user"), name: input.name, email: input.email, passwordHash, emailVerified: false, role: "customer", disabled: false, addresses: [], createdAt: new Date().toISOString() };
      d.users.push(user); return publicUser(user);
    });
  }
  async login(email: string, password: string) {
    const found = (await this.store.snapshot()).users.find((u) => u.email === email);
    const verified = await verifyPassword(password, found?.passwordHash);
    if (!verified || !found || found.disabled) throw new StoreError("ইমেইল বা পাসওয়ার্ড সঠিক নয়", 401);
    const raw = randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const user = await this.store.transaction((d) => {
      const current = d.users.find((u) => u.id === found.id);
      if (!current || current.disabled || current.passwordHash !== found.passwordHash || current.authVersion !== found.authVersion) throw new StoreError("আবার লগইন করুন", 401);
      d.sessions = d.sessions.filter((s) => Date.parse(s.expiresAt) > Date.now());
      d.tokens = d.tokens.filter((s) => Date.parse(s.expiresAt) > Date.now());
      current.lastLoginAt = new Date().toISOString();
      d.sessions.push({ id: tokenHash(raw), userId: current.id, expiresAt, createdAt: current.lastLoginAt });
      return publicUser(current);
    });
    return { raw, expiresAt, user };
  }
  async resolve(raw?: string) {
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const d = await this.store.snapshot(); const s = d.sessions.find((s) => s.id === tokenHash(raw) && Date.parse(s.expiresAt) > Date.now());
    const u = s && d.users.find((u) => u.id === s.userId && !u.disabled);
    return u ? publicUser(u) : null;
  }
  logout(raw?: string) { return this.store.transaction((d) => { if (raw) d.sessions = d.sessions.filter((s) => s.id !== tokenHash(raw)); }); }
  async reset(token: string, password: string, purpose: "reset" | "verify") {
    const hashed = purpose === "reset" ? await hashPassword(password) : "";
    return this.store.transaction((d) => {
      const t = d.tokens.find((t) => t.id === tokenHash(token) && t.purpose === purpose && Date.parse(t.expiresAt) > Date.now());
      if (!t) throw new StoreError("লিংকটি অকার্যকর বা মেয়াদ শেষ হয়েছে", 400);
      const u = d.users.find((u) => u.id === t.userId && !u.disabled); if (!u) throw new StoreError("অ্যাকাউন্ট পাওয়া যায়নি", 400);
      if (purpose === "reset") { u.passwordHash = hashed; d.sessions = d.sessions.filter((s) => s.userId !== u.id); }
      u.emailVerified = true;
      d.tokens = d.tokens.filter((x) => !(x.userId === u.id && x.purpose === purpose));
      // Expire any queued secret links that have just been consumed.
      for (const m of d.outbox) if (m.userId === u.id && m.type === purpose && m.status !== "sent") { m.status = "failed"; m.text = "Expired identity link"; }
      return { ok: true };
    });
  }
}
