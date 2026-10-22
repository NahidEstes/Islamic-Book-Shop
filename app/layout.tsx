import type { Metadata } from "next";
import localFont from "next/font/local";
import { StoreProvider } from "@/components/store-provider";
import { AuthProvider } from "@/components/auth-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";
import "./commerce.css";

const bengali = localFont({ src: [{ path: "../public/fonts/noto-bengali-regular.ttf", weight: "400" }, { path: "../public/fonts/noto-bengali-semibold.ttf", weight: "600" }, { path: "../public/fonts/noto-bengali-bold.ttf", weight: "700" }], variable: "--font-bengali", display: "swap" });
const serif = localFont({ src: "../public/fonts/noto-serif-bengali.ttf", variable: "--font-serif", display: "swap" });
export const metadata: Metadata = { title: { default: "নূর বুকশপ — ভালো বই, সুন্দর জীবন", template: "%s | নূর বুকশপ" }, description: "তাফসির, হাদিস, সীরাত ও শিশুদের ইসলামিক বইয়ের অনলাইন সংগ্রহ। পছন্দের বই খুঁজুন, কার্টে রাখুন এবং সহজে অর্ডার করুন।", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="bn" data-scroll-behavior="smooth" className={`${bengali.variable} ${serif.variable}`}><body><AuthProvider><StoreProvider><a href="#main-content" className="skip-link">মূল কনটেন্টে যান</a><Header /><main id="main-content">{children}</main><Footer /></StoreProvider></AuthProvider></body></html>;
}
