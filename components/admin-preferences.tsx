"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { adminEnglish } from "@/lib/admin-english";

type Language = "bn" | "en";
type Theme = "light" | "dark";
const storageKey = "noor-admin-preferences-v1";
const defaults: { language: Language; theme: Theme } = { language: "bn", theme: "light" };

function translations(language: Language) {
  const locale = language === "en" ? "en-GB" : "bn-BD";
  const t = (key: string) => language === "en" && Object.hasOwn(adminEnglish, key) ? adminEnglish[key] : key;
  const { format: bn } = new Intl.NumberFormat(locale);
  const long = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const day = (formatter: Intl.DateTimeFormat, value: string) => value ? formatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : t("নির্ধারিত হয়নি");
  return { t, bn, money: (value: number) => `৳ ${bn(value)}`, dateLabel: (value: string) => day(long, value), chartDate: (value: string) => day(short, value), dateTime: (value: string) => time.format(new Date(value)) };
}

type Preferences = typeof defaults & ReturnType<typeof translations> & {
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
};
const Context = createContext<Preferences | null>(null);

export function AdminPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) setPreferences({ language: saved.language === "en" ? "en" : "bn", theme: saved.theme === "dark" ? "dark" : "light" });
    } catch { /* Preferences remain usable when storage is unavailable. */ }
  }, []);
  const formatting = useMemo(() => translations(preferences.language), [preferences.language]);

  function change(next: typeof defaults) {
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the choice for this visit. */ }
  }

  return <Context.Provider value={{ ...preferences, ...formatting, setLanguage: (language) => change({ ...preferences, language }), setTheme: (theme) => change({ ...preferences, theme }) }}>{children}</Context.Provider>;
}

export function useAdminPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("AdminPreferencesProvider is required");
  return value;
}

export function AdminPreferencesControls() {
  const { language, theme, t, setLanguage, setTheme } = useAdminPreferences();
  const dark = theme === "dark";
  return <div className="signature-preferences" role="group" aria-label={t("অ্যাডমিনের পছন্দ")}>
    <select aria-label={t("ভাষা নির্বাচন করুন")} value={language} onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "bn")}>
      <option value="bn" lang="bn">বাংলা</option><option value="en" lang="en">English</option>
    </select>
    <button type="button" title={t(dark ? "লাইট মোড চালু করুন" : "ডার্ক মোড চালু করুন")} aria-pressed={dark} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />} {t("ডার্ক মোড")}
    </button>
  </div>;
}
