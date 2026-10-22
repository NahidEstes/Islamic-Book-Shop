"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/commerce-types";
import { api } from "@/lib/api";
type AuthContext = { user: PublicUser | null; loading: boolean; refreshAuth: () => Promise<void>; logout: () => Promise<void> };
const Context = createContext<AuthContext | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null); const [loading, setLoading] = useState(true);
  const refreshAuth = useCallback(async () => { try { setUser((await api<{ user: PublicUser | null }>("/auth/me")).user); } finally { setLoading(false); } }, []);
  useEffect(() => { void refreshAuth().catch(() => setUser(null)); }, [refreshAuth]);
  async function logout() { await api("/auth/logout", { method: "POST", body: "{}" }); setUser(null); }
  return <Context.Provider value={{ user, loading, refreshAuth, logout }}>{children}</Context.Provider>;
}
export function useAuth() { const ctx = useContext(Context); if (!ctx) throw new Error("AuthProvider is required"); return ctx; }
