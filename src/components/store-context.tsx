"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import en from "@/messages/en.json";
import bn from "@/messages/bn.json";
import { normalizeQuantity } from "@/lib/product-units";

export type Locale = "en" | "bn";
export type CartLine = { id: string; slug: string; name: string; image: string; originalPrice?: number; price: number; quantity: number; unit?: string; variantId?: string; variantLabel?: string; variantImage?: string };
export const cartLineKey = (line: Pick<CartLine, "id" | "variantId">) => `${line.id}:${line.variantId ?? ""}`;
export type WishlistItem = {
  _id?: string;
  id?: string;
  slug: string;
  title: { en: string; bn?: string };
  price: number;
  discountPrice?: number;
  images?: string[];
  stock?: number;
  unit?: string;
  category?: { name?: { en?: string; bn?: string } };
  variants?: { _id?: string; label: string; price: number; stock: number }[];
};
const wishlistItemKey = (item: Pick<WishlistItem, "_id" | "id" | "slug">) => item._id ?? item.id ?? item.slug;
type StoreContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof typeof en) => string;
  cart: CartLine[];
  addToCart: (line: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  wishlist: WishlistItem[];
  toggleWishlist: (item: WishlistItem) => void;
  isWishlisted: (id: string) => boolean;
};
const Context = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [wishlistReady, setWishlistReady] = useState(false);
  const [syncCart, setSyncCart] = useState(false);
  const cartRef = useRef<CartLine[]>([]);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  const syncServerCart = useCallback(async (merge: CartLine[] = []) => {
    try {
      const authResponse = await fetch("/api/auth/me");
      if (!authResponse.ok) return;
      const auth = await authResponse.json() as { user?: { role?: string } | null };
      if (!auth.user || auth.user.role !== "customer") { setSyncCart(false); return; }
      const response = await fetch("/api/cart");
      if (!response.ok) throw new Error("Could not sync your cart");
      const data = await response.json() as { items?: CartLine[] };
      const serverItems = data.items ?? [];
      const merged = [...serverItems];
      for (const local of merge) {
        const key = cartLineKey(local);
        const found = merged.find((item) => cartLineKey(item) === key);
        if (found) found.quantity = Math.min(100_000, found.quantity + local.quantity);
        else merged.push({ ...local, unit: local.unit ?? "piece" });
      }
      setCart(merged);
      setSyncCart(true);
    } catch (error) {
      console.error("Could not sync the saved cart.", error);
    }
  }, []);
  useEffect(() => {
    const savedLocale = localStorage.getItem("eshop-locale");
    if (savedLocale === "bn" || savedLocale === "en") window.setTimeout(() => {
      document.documentElement.lang = savedLocale;
      setLocaleState(savedLocale);
    }, 0);
    let localCart: CartLine[] = [];
    try {
      const savedCart = JSON.parse(localStorage.getItem("eshop-cart") ?? "[]") as CartLine[];
      if (Array.isArray(savedCart)) { localCart = savedCart; window.setTimeout(() => setCart(savedCart), 0); }
    } catch (error) {
      console.warn("Could not read the saved cart.", error);
    }
    let savedWishlist: WishlistItem[] = [];
    try {
      const parsedWishlist = JSON.parse(localStorage.getItem("eshop-wishlist") ?? "[]") as WishlistItem[];
      if (Array.isArray(parsedWishlist)) savedWishlist = parsedWishlist;
    } catch (error) {
      console.warn("Could not read the saved wishlist.", error);
    }
    const readyTimer = window.setTimeout(() => setCartReady(true), 0);
    const wishlistReadyTimer = window.setTimeout(() => {
      setWishlist(savedWishlist);
      setWishlistReady(true);
    }, 0);
    const syncTimer = window.setTimeout(() => { void syncServerCart(localCart); }, 0);
    const handleAuthChanged = () => { void syncServerCart(cartRef.current); };
    window.addEventListener("eshop:auth-changed", handleAuthChanged);
    return () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(wishlistReadyTimer);
      window.clearTimeout(syncTimer);
      window.removeEventListener("eshop:auth-changed", handleAuthChanged);
    };
  }, [syncServerCart]);
  useEffect(() => {
    if (cartReady) localStorage.setItem("eshop-cart", JSON.stringify(cart));
  }, [cart, cartReady]);
  useEffect(() => {
    if (wishlistReady) localStorage.setItem("eshop-wishlist", JSON.stringify(wishlist));
  }, [wishlist, wishlistReady]);
  useEffect(() => {
    if (!syncCart || !cartReady) return;
    const timer = window.setTimeout(async () => {
      // শুধু লগইন করা কাস্টমার গুলো কার্ট সার্ভারে সেভ করবে; অন্য রোল বা অনলাইন নেই ইউজার এর জন্য চুপচাপ বের হয়ে যাই।
      const authResponse = await fetch("/api/auth/me");
      if (!authResponse.ok) return;
      const auth = await authResponse.json() as { user?: { role?: string } | null };
      if (!auth.user || auth.user.role !== "customer") return;

      const response = await fetch("/api/cart", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: item.quantity })) }),
      });
      if (!response.ok) {
        // 401/403 আশা করা একটি Situation (ইউজার লগইন নেই বা কাস্টমার নেই)—লাল Console Error ওভারলে দেখাই না।
        if (response.status === 401 || response.status === 403) return;
        console.warn("Could not save your cart to your account.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [cart, cartReady, syncCart]);
  const setLocale = useCallback((value: Locale) => {
    setLocaleState(value);
    localStorage.setItem("eshop-locale", value);
    document.documentElement.lang = value;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const addToCart = useCallback((line: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    setCart((current) => {
      const key = cartLineKey(line);
      const existing = current.find((item) => cartLineKey(item) === key);
      const amount = normalizeQuantity(line.unit, line.quantity ?? 1);
      if (existing) return current.map((item) => cartLineKey(item) === key ? { ...item, quantity: Math.min(item.quantity + amount, 100_000) } : item);
      return [...current, { ...line, unit: line.unit ?? "piece", quantity: amount }];
    });
  }, []);
  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((current) => quantity <= 0 ? current.filter((item) => cartLineKey(item) !== key) : current.map((item) => cartLineKey(item) === key ? { ...item, quantity: Math.min(normalizeQuantity(item.unit, quantity), 100_000) } : item));
  }, []);
  const removeFromCart = useCallback((key: string) => setCart((current) => current.filter((item) => cartLineKey(item) !== key)), []);
  const clearCart = useCallback(() => setCart([]), []);
  const toggleWishlist = useCallback((item: WishlistItem) => {
    const key = wishlistItemKey(item);
    setWishlist((current) => current.some((saved) => wishlistItemKey(saved) === key)
      ? current.filter((saved) => wishlistItemKey(saved) !== key)
      : [...current, item]);
  }, []);
  const isWishlisted = useCallback((id: string) => wishlist.some((item) => wishlistItemKey(item) === id), [wishlist]);
  const value = useMemo(() => ({
    locale, setLocale, t: (key: keyof typeof en) => (locale === "bn" ? bn : en)[key],
    cart, addToCart, updateQuantity, removeFromCart, clearCart,
    wishlist, toggleWishlist, isWishlisted,
  }), [locale, setLocale, cart, addToCart, updateQuantity, removeFromCart, clearCart, wishlist, toggleWishlist, isWishlisted]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useStore() {
  const context = useContext(Context);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}
