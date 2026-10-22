import Link from "next/link";
export function Logo({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="নূর বুকশপ হোমপেজ">
    <svg width="56" height="56" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M6 23v31c9-2 17-1 26 4 9-5 17-6 26-4V23" stroke="#C49A50" strokeWidth="2.4" />
      <path d="M11 16c9 0 16 4 21 10v27c-7-7-13-9-21-9V16Zm42 0c-9 0-16 4-21 10v27c7-7 13-9 21-9V16Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 10c6 1 10 4 15 10 5-6 9-9 15-10-2 7-7 12-15 16-8-4-13-9-15-16Z" fill="currentColor" opacity=".95" />
      <path d="m32 1 4 6-4 7-4-7 4-6Z" fill="#C49A50" />
    </svg>
    <span><strong>নূর বুকশপ</strong><small>ভালো বই, সুন্দর জীবন</small></span>
  </Link>;
}
