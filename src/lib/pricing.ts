export type PriceLike = {
  price?: number | null;
  discountPrice?: number | null;
  originalPrice?: number | null;
};

export type VariantPriceLike = PriceLike & {
  label?: string;
  stock?: number;
};

export function toMoney(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function discountPercent(original: number, current: number) {
  if (!Number.isFinite(original) || !Number.isFinite(current)) return 0;
  if (original <= 0 || current < 0 || current >= original) return 0;
  return Math.round(((original - current) / original) * 100);
}

export function hasValidDiscount(original: number, current: number) {
  return discountPercent(original, current) > 0;
}

export function resolveSimplePricing(product: PriceLike) {
  const regular = toMoney(product.price);
  const sale = product.discountPrice == null ? null : toMoney(product.discountPrice);
  const original = product.originalPrice == null ? regular : toMoney(product.originalPrice);
  const current = sale != null && sale > 0 && sale < original ? sale : original > 0 ? regular : regular;
  // legacy: discountPrice is the selling/current price, price is regular/original
  if (sale != null && sale >= 0 && sale < regular) {
    return { original: regular, current: sale, discountPercent: discountPercent(regular, sale) };
  }
  if (original > regular && regular > 0) {
    return { original, current: regular, discountPercent: discountPercent(original, regular) };
  }
  return { original: Math.max(regular, current), current: regular, discountPercent: 0 };
}

export function resolveVariantPricing(variant: VariantPriceLike) {
  const current = toMoney(variant.price);
  const original = variant.originalPrice == null ? current : toMoney(variant.originalPrice);
  if (hasValidDiscount(original, current)) return { original, current, discountPercent: discountPercent(original, current) };
  const sale = variant.discountPrice == null ? null : toMoney(variant.discountPrice);
  if (sale != null && hasValidDiscount(current, sale)) return { original: current, current: sale, discountPercent: discountPercent(current, sale) };
  return { original: Math.max(original, current), current, discountPercent: 0 };
}

export function formatBdt(amount: number) {
  return `৳${Number(amount || 0).toLocaleString("en-BD")}`;
}

export type VariantLike = VariantPriceLike & { _id?: string; id?: string; label?: string; stock?: number };
export type ProductPriceLike = PriceLike & { variants?: VariantLike[]; stock?: number };

export type ResolvedProductPricing = { original: number; current: number; discountPercent: number; stock: number; variantLabel: string; hasVariants: boolean; selected: boolean; lowestLabel?: string };
export function resolveProductPricing(product: ProductPriceLike, selectedVariantId?: string): ResolvedProductPricing {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    const selected = selectedVariantId ? variants.find((v) => String(v._id ?? v.id ?? "") === selectedVariantId) : undefined;
    if (selected) {
      const p = resolveVariantPricing(selected);
      return { ...p, stock: toMoney(selected.stock), variantLabel: selected.label ?? "", hasVariants: true, selected: true };
    }
    const priced = variants.map((v) => ({ v, p: resolveVariantPricing(v) }));
    const best = priced.slice().sort((a,b)=>a.p.current-b.p.current || b.p.discountPercent-a.p.discountPercent)[0];
    const totalStock = variants.reduce((sum,v)=>sum + toMoney(v.stock), 0);
    return { ...(best?.p ?? { original: 0, current: 0, discountPercent: 0 }), stock: totalStock, variantLabel: "", hasVariants: true, selected: false, lowestLabel: best?.v.label ?? "" };
  }
  const p = resolveSimplePricing(product);
  return { ...p, stock: toMoney(product.stock), variantLabel: "", hasVariants: false, selected: false };
}

export type BuyerRole = "retail" | "reseller" | "wholesaler" | string;
export type RolePricingProduct = ProductPriceLike & { resellerPrice?: number | null; wholesalerPrice?: number | null; resellerMoq?: number | null; wholesalerMoq?: number | null };
export function normalizeBuyerRole(role?: string | null): BuyerRole {
  if (role === "reseller" || role === "wholesaler") return role;
  return "retail";
}
export function roleUnitPrice(product: RolePricingProduct, baseCurrent: number, role?: string | null) {
  const r = normalizeBuyerRole(role);
  if (r === "reseller") {
    const p = toMoney(product.resellerPrice);
    if (p > 0) return p;
  }
  if (r === "wholesaler") {
    const p = toMoney(product.wholesalerPrice);
    if (p > 0) return p;
  }
  return baseCurrent;
}
export function roleMoq(product: RolePricingProduct, role?: string | null) {
  const r = normalizeBuyerRole(role);
  if (r === "reseller") return Math.max(1, toMoney(product.resellerMoq) || 1);
  if (r === "wholesaler") return Math.max(1, toMoney(product.wholesalerMoq) || 1);
  return 1;
}
export function resolveRolePricing(product: RolePricingProduct, role?: string | null, selectedVariantId?: string) {
  const base = resolveProductPricing(product, selectedVariantId);
  const moq = roleMoq(product, role);
  // Role-specific simple product pricing (additive): applies when no variant selected; variants keep variant price.
  const current = base.hasVariants && base.selected ? base.current : roleUnitPrice(product, base.current, role);
  const original = base.original > current ? base.original : current;
  return { ...base, current, original, discountPercent: discountPercent(original, current), moq, buyerRole: normalizeBuyerRole(role) };
}
