"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { CartItem, Product } from "@/lib/types";
import { api } from "@/lib/api";
import { availableQuantity } from "@/lib/availability";

type StoreContextType = {
  products: Product[]; loading: boolean; error: string; demo: boolean; readOnly: boolean; ready: boolean;
  cart: CartItem[]; wishlist: string[]; count: number;
  addToCart: (id: string, quantity?: number) => boolean;
  setQuantity: (id: string, quantity: number) => void;
  toggleWishlist: (id: string) => void;
  clearCart: () => void; notify: (message: string) => void; refresh: () => Promise<void>;
  addItems: (items: CartItem[], updatedProducts?: Product[]) => void;
};
const StoreContext = createContext<StoreContextType | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [catalog, config] = await Promise.all([api<{ products: Product[] }>("/products"), api<{ demo: boolean; readOnly?: boolean }>("/config")]);
      setProducts(catalog.products); setDemo(config.demo); setReadOnly(config.readOnly === true); setError("");
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    try {
      const c: unknown = JSON.parse(localStorage.getItem("noor-cart-v1") || "[]");
      const w: unknown = JSON.parse(localStorage.getItem("noor-wishlist-v1") || "[]");
      if (Array.isArray(c)) setCart(c.filter((i) => i && typeof i.productId === "string" && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 20).slice(0, 50));
      if (Array.isArray(w)) setWishlist(w.filter((id) => typeof id === "string").slice(0, 100));
    } catch { /* Invalid local data is safely ignored. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem("noor-cart-v1", JSON.stringify(cart)); localStorage.setItem("noor-wishlist-v1", JSON.stringify(wishlist)); } catch { /* Storage may be disabled in a private session. */ } } }, [cart, wishlist, ready]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timeout); }, [toast]);
  function addToCart(id: string, quantity = 1) {
    const product = products.find((p) => p.id === id);
    if (!product) return false;
    const existing = cart.find((i) => i.productId === id)?.quantity || 0;
    if (existing + quantity > Math.min(availableQuantity(product), 20)) { setToast("এই পরিমাণ বই বা প্রি-অর্ডার কোটা নেই"); return false; }
    setCart((items) => { const found = items.some((i) => i.productId === id); return found ? items.map((i) => i.productId === id ? { ...i, quantity: Math.min(i.quantity + quantity, availableQuantity(product), 20) } : i) : [...items, { productId: id, quantity }]; });
    setToast("বইটি কার্টে যোগ হয়েছে");
    return true;
  }
  function setQuantity(id: string, quantity: number) {
    if (quantity <= 0) { setCart((items) => items.filter((i) => i.productId !== id)); return; }
    const p = products.find((p) => p.id === id);
    if (!p || quantity > Math.min(availableQuantity(p), 20)) { setToast("এই পরিমাণ বই বা প্রি-অর্ডার কোটা নেই"); return; }
    setCart((items) => items.map((i) => i.productId === id ? { ...i, quantity } : i));
  }
  function toggleWishlist(id: string) { setWishlist((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]); }
  function addItems(items: CartItem[], updatedProducts?: Product[]) {
    const currentProducts = updatedProducts || products;
    if (updatedProducts) setProducts(updatedProducts);
    let skipped = false; const merged = new Map(cart.map((i) => [i.productId, i.quantity]));
    for (const item of items) { const p = currentProducts.find((p) => p.id === item.productId); if (!p || !availableQuantity(p)) { skipped = true; continue; } const desired = (merged.get(p.id) || 0) + item.quantity; const quantity = Math.min(desired, availableQuantity(p), 20); if (quantity !== desired) skipped = true; merged.set(p.id, quantity); }
    setCart([...merged].map(([productId, quantity]) => ({ productId, quantity }))); setToast(skipped ? "উপলব্ধ পরিমাণ কার্টে যোগ হয়েছে; বর্তমান দাম ও স্টক দেখে নিন" : "বর্তমান দাম ও স্টক অনুযায়ী বই কার্টে যোগ হয়েছে");
  }
  return <StoreContext.Provider value={{ products, loading, error, demo, readOnly, ready, cart, wishlist, count: cart.reduce((n, i) => n + i.quantity, 0), addToCart, addItems, setQuantity, toggleWishlist, clearCart: () => setCart([]), notify: setToast, refresh }}>
    {children}
    {toast && <div className="toast" role="status"><CheckCircle2 size={20} /><span>{toast}</span><button aria-label="বার্তা বন্ধ করুন" onClick={() => setToast("")}><X size={17} /></button></div>}
  </StoreContext.Provider>;
}
export function useStore() { const ctx = useContext(StoreContext); if (!ctx) throw new Error("StoreProvider is required"); return ctx; }
