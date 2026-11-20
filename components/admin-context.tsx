"use client";
import { useAdminPreferences } from "./admin-preferences";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Asset, Permission } from "@/lib/commerce-types";
export type AdminContextType = {
  permissions: readonly Permission[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  upload: (file: File, kind: Asset["kind"], productId?: string) => Promise<Asset>;
  run: (action: () => Promise<unknown>, message?: string) => Promise<void>;
  busy: boolean; setError: (message: string) => void;
};
export const AdminContext = createContext<AdminContextType | null>(null);
export function useAdmin() { const ctx = useContext(AdminContext); if (!ctx) throw new Error("AdminContext is required"); return ctx; }
export function useAdminResource<T>(path: string) {
  const { request } = useAdmin(); const [data, setData] = useState<T | null>(null); const [error, setError] = useState("");
  const reload = useCallback(async () => { try { const value = await request<T>(path); setData(value); setError(""); } catch (e) { setError((e as Error).message); throw e; } }, [path, request]);
  useEffect(() => { let active = true; void request<T>(path).then((r) => { if (active) { setData(r); setError(""); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [path, request]);
  return { data, error, reload, setData };
}
export function AdminResourceState({ error, loading }: { error: string; loading: boolean }) {
  const { t } = useAdminPreferences(); return error ? <p className="form-error" role="alert">{t(error)}</p> : loading ? <p className="muted">{t("তথ্য লোড হচ্ছে...")}</p> : null; }
