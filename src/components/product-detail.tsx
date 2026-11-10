"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductView } from "@/components/product-card";
import { isValidQuantity, quantityStep, unitLabel } from "@/lib/product-units";
import { formatBdt, resolveProductPricing } from "@/lib/pricing";

type Detail = ProductView & {
  description?: { en: string; bn?: string };
  category?: { name?: { en: string; bn?: string } };
  stock?: number;
  unit?: string;
  variants?: { _id?: string; label: string; price: number; originalPrice?: number; stock: number }[];
};
type ProductComment = { _id: string; customerName: string; message: string; createdAt: string; adminReply?: string; repliedAt?: string };

export function ProductDetail({ slug }: { slug: string }) {
  const { locale, addToCart, t, toggleWishlist, isWishlisted } = useStore();
  const router = useRouter();
  const [product, setProduct] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [commentError, setCommentError] = useState("");
  const [commentNotice, setCommentNotice] = useState("");
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [postingComment, setPostingComment] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let active = true;
    fetch(`/api/products/${encodeURIComponent(slug)}`).then(async (response) => {
      const result = await response.json() as { item?: Detail; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Product not found");
      if (!active) return;
      setProduct(result.item);
      setSelectedVariantId(result.item.variants?.find((variant) => variant.stock > 0)?._id ?? "");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load product");
    });
    fetch(`/api/products/${encodeURIComponent(slug)}/comments`).then(async (response) => {
      const result = await response.json() as { items?: ProductComment[]; error?: string };
      if (!response.ok) throw new Error(result.error || t("commentLoadFailed"));
      if (active) setComments(result.items ?? []);
    }).catch((reason: unknown) => {
      if (active) setCommentError(reason instanceof Error ? reason.message : t("commentLoadFailed"));
    }).finally(() => { if (active) setLoadingComments(false); });
    return () => { active = false; };
  }, [slug, t]);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentError(""); setCommentNotice(""); setPostingComment(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: commentText }) });
      const result = await response.json() as { item?: ProductComment; error?: string };
      const item = result.item;
      if (!response.ok || !item) throw new Error(response.status === 401 ? t("signInToComment") : response.status === 403 ? t("commentNotAllowed") : response.status === 429 ? t("commentRateLimited") : result.error || t("commentPostFailed"));
      setComments((current) => [item, ...current].slice(0, 100));
      setCommentText("");
      setCommentNotice(t("commentPosted"));
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : t("commentPostFailed"));
    } finally { setPostingComment(false); }
  }

  const hasVariants = Boolean(product?.variants?.length);
  const selectedVariant = product?.variants?.find((variant) => variant._id === selectedVariantId);
  const pricing = useMemo(() => product ? resolveProductPricing(product, selectedVariantId) : null, [product, selectedVariantId]);
  if (error) return <div className="page-shell"><p>{error}</p><Link className="button-primary" href="/products">Back to products</Link></div>;
  if (!product || !pricing) return <div className="page-shell">Loading product…</div>;

  const id = product._id ?? product.slug;
  const name = product.title[locale] || product.title.en;
  const description = product.description?.[locale] || product.description?.en || "";
  const image = product.images?.[0];
  const unit = product.unit ?? "piece";
  const step = quantityStep(unit);
  const stock = pricing.stock;
  const wishlisted = isWishlisted(id);
  const canAct = stock > 0 && (!hasVariants || Boolean(selectedVariant?._id)) && isValidQuantity(unit, quantity) && quantity <= stock;

  function buyNow() {
    if (!product?._id || (hasVariants && !selectedVariant?._id) || !canAct) return;
    const params = new URLSearchParams({ buyNow: product._id, quantity: String(quantity), ...(selectedVariant?._id ? { variantId: selectedVariant._id } : {}) });
    router.push(`/checkout?${params.toString()}`);
  }

  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">Home</Link> / <Link href="/products">Products</Link> / {name}</div>
    <div className="product-detail">
      <div className="detail-art">{image?.startsWith("https://res.cloudinary.com/") ? <Image src={image} alt={name} width={600} height={600} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }} /> : "◉"}</div>
      <div className="detail-copy">
        <p className="eyebrow">{product.category?.name?.[locale] || "Store product"}</p>
        <h1>{name}</h1>
        <div className="detail-price" style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong>{formatBdt(pricing.current)}</strong>
          {pricing.discountPercent > 0 ? <del style={{ color: "#a4aaae", fontSize: 15 }}>{formatBdt(pricing.original)}</del> : null}
          {pricing.discountPercent > 0 ? <span className="sale-tag" style={{ position: "static" }}>{pricing.discountPercent}% OFF</span> : null}
          <span>/ {hasVariants ? (pricing.variantLabel || selectedVariant?.label || t("productOption")) : unitLabel(unit, locale)}</span>
        </div>
        <p>{description}</p>
        {hasVariants && <div className="product-option-field">
          <p className="product-option-label">{t("productOption")}</p>
          <div className="product-variant-options" role="group" aria-label={t("productOption")}>
            {product.variants!.map((variant) => <button type="button" key={variant._id} className={`product-variant-option${selectedVariantId === variant._id ? " selected" : ""}`} aria-pressed={selectedVariantId === variant._id} disabled={variant.stock <= 0} onClick={() => { setSelectedVariantId(variant._id ?? ""); setQuantity(step); }}>
              <strong>{variant.label}</strong>
              <span>{formatBdt(variant.price)}</span>
              <small>{variant.stock > 0 ? `${variant.stock} ${t("inStock")}` : t("outOfStock")}</small>
            </button>)}
          </div>
        </div>}
        <p>{stock <= 0 ? t("outOfStock") : `${stock} ${unitLabel(unit, locale)} ${t("inStock")}`}</p>
        {stock > 0 && <div className="field product-quantity-field"><label htmlFor="product-quantity">Quantity ({unitLabel(unit, locale)})</label><input id="product-quantity" type="number" min={step} max={stock} step={step} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div>}
        <div className="product-detail-actions">
          <button type="button" className="button-primary" disabled={!canAct} onClick={buyNow}><ShoppingBag size={16} /> {t("buyNow")}</button>
          <button type="button" className="button-secondary" disabled={!canAct} onClick={() => addToCart({ id, slug: product.slug, name, image: image ?? "", originalPrice: pricing.discountPercent > 0 ? pricing.original : undefined, price: pricing.current, quantity, unit, ...(selectedVariant?._id ? { variantId: selectedVariant._id, variantLabel: selectedVariant.label } : {}) })}>{t("addToCart")}</button>
          <button type="button" className={`button-secondary wishlist-detail-button${wishlisted ? " is-active" : ""}`} aria-pressed={wishlisted} onClick={() => toggleWishlist(product)}><Heart size={16} fill={wishlisted ? "currentColor" : "none"} /> {wishlisted ? "Saved to wishlist" : "Add to wishlist"}</button>
        </div>
        <p className="subtle">{t("secureCheckout")}</p>
      </div>
    </div>
    <section className="product-comments" aria-labelledby="product-comments-title">
      <h2 id="product-comments-title">{t("productComments")}</h2>
      <form className="product-comment-form" onSubmit={submitComment}>
        <label htmlFor="product-comment-message">{t("leaveComment")}</label>
        <textarea id="product-comment-message" value={commentText} onChange={(event) => setCommentText(event.target.value)} required minLength={2} maxLength={2000} rows={4} placeholder={t("commentPlaceholder")} />
        <button className="button-primary" disabled={postingComment || commentText.trim().length < 2}>{postingComment ? t("postingComment") : t("postComment")}</button>
      </form>
      {commentError && <p className="form-error" role="alert">{commentError}{commentError === t("signInToComment") && <> <Link href="/account">{t("signIn")}</Link></>}</p>}
      {commentNotice && <p className="form-success" role="status">{commentNotice}</p>}
      {loadingComments ? <p className="subtle">{t("loadingComments")}</p> : comments.length === 0 ? <p className="subtle">{t("noComments")}</p> : <div className="product-comment-list">
        {comments.map((comment) => <article className="product-comment-card" key={comment._id}>
          <header><strong>{comment.customerName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-BD")}</time></header>
          <p>{comment.message}</p>
          {comment.adminReply && <div className="product-comment-reply"><strong>{t("teamReplied")}</strong><p>{comment.adminReply}</p>{comment.repliedAt && <time dateTime={comment.repliedAt}>{new Date(comment.repliedAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-BD")}</time>}</div>}
        </article>)}
      </div>}
    </section>
  </div>;
}
