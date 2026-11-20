"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { InventoryData } from "@/lib/commerce-types";
import { inventoryHref, newPurchaseHref } from "@/lib/admin-routes";
import { useAdmin, useAdminResource, AdminResourceState } from "./admin-context";
import { useAdminPreferences } from "./admin-preferences";
import { useStore } from "./store-provider";
import styles from "./inventory.module.css";

type InventoryContext = {
  data: InventoryData | null; busy: boolean; reload: () => Promise<void>;
  mutate: <T>(path: string, body: unknown, method?: "POST" | "PUT") => Promise<T | null>;
};
const Context = createContext<InventoryContext | null>(null);
export function useInventory() {
  const value = useContext(Context);
  if (!value) throw new Error("Inventory provider is required");
  return value;
}
export const inventoryToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh" }).format(new Date());

export function InventoryShell({ children }: { children: ReactNode }) {
  const { t } = useAdminPreferences();
  const { request } = useAdmin();
  const { refresh } = useStore();
  const { data, error, reload } = useAdminResource<InventoryData>("/inventory");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const pathname = usePathname();
  useEffect(() => { setFeedback(""); }, [pathname]);
  async function mutate<T,>(path: string, body: unknown, method: "POST" | "PUT" = "POST"): Promise<T | null> {
    if (busy) return null;
    setBusy(true); setFeedback("");
    try {
      const result = await request<T>(`/inventory${path}`, { method, body: JSON.stringify(body) });
      await reload();
      void refresh();
      return result;
    } catch (failure) { setFeedback((failure as Error).message); return null; }
    finally { setBusy(false); }
  }
  const tabs = [[inventoryHref, "সারাংশ"], [`${inventoryHref}/purchases`, "ক্রয় ও চালান"], [`${inventoryHref}/suppliers`, "সরবরাহকারী"], [`${inventoryHref}/movements`, "স্টক পরিবর্তন"]] as const;
  return <Context.Provider value={{ data, busy, reload, mutate }}>
    <div className={styles.workspace}>
      <header className="signature-heading"><h1>{t("স্টক ও ক্রয়")}</h1><Link href={newPurchaseHref} className="button">{t("নতুন ক্রয়")}</Link></header>
      <nav className={styles.tabs} aria-label={t("ইনভেন্টরি বিভাগ")}>
        {tabs.map(([href, label]) => <Link href={href} key={href} aria-current={href === inventoryHref ? pathname === href ? "page" : undefined : pathname.startsWith(href) ? "page" : undefined}>{t(label)}</Link>)}
      </nav>
      <AdminResourceState error={error} loading={!data} />
      {feedback && <p className="form-error" role="alert">{t(feedback)}</p>}
      {data && children}
    </div>
  </Context.Provider>;
}
