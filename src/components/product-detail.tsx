"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag, ZoomIn, ZoomOut } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductView } from "@/components/product-card";
import { isValidQuantity, quantityStep, unitLabel } from "@/lib/product-units";
import { formatBdt, resolveProductPricing } from "@/lib/pricing";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

type Detail = ProductView & {
  description?: { en: string; bn?: string };
  productDetails?: string;
  category?: { name?: { en: string; bn?: string } };
  stock?: number;
  unit?: string;
  variants?: { _id?: string; label: string; colorHex?: string; price: number; originalPrice?: number; stock: number; sku?: string; availability?: string; images?: string[] }[];
};
type ProductComment = { _id: string; customerName: string; message: string; rating?: number; images?: string[]; createdAt: string; adminReply?: string; repliedAt?: string };

export function ProductDetail({ slug }: { slug: string }) {
  const { locale, addToCart, t, toggleWishlist, isWishlisted } = useStore();
  const router = useRouter();
  const [product, setProduct] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [commentError, setCommentError] = useState("");
  const [commentNotice, setCommentNotice] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState(5);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [postingComment, setPostingComment] = useState(false);
  const [uploadingCommentImages, setUploadingCommentImages] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [detailZoomed, setDetailZoomed] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [tradeRole, setTradeRole] = useState<"reseller" | "wholesaler" | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r)=>r.json() as Promise<{user?:{role?:string}|null}>).then((d)=>{ if(d.user?.role==="reseller") setTradeRole("reseller"); else if(d.user?.role==="wholesaler") setTradeRole("wholesaler"); }).catch(()=>{}); }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/products/${encodeURIComponent(slug)}`).then(async (response) => {
      const result = await response.json() as { item?: Detail; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Product not found");
      if (!active) return;
      setProduct(result.item);
      setSelectedImageIndex(0);
      setSelectedVariantId(result.item.variants?.find((variant) => variant.stock > 0 && variant.availability !== "out_of_stock")?._id ?? "");
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
  async function uploadCommentImages(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (commentImages.length + files.length > 4) {
      setCommentError(t("reviewImageLimit"));
      input.value = "";
      return;
    }
    if (files.some((file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) {
      setCommentError(t("reviewImageInvalid"));
      input.value = "";
      return;
    }
    setCommentError("");
    setUploadingCommentImages(true);
    try {
      const results = await Promise.allSettled(files.map((file) => uploadToCloudinary(file, "product-review")));
      const urls = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setCommentImages((current) => [...current, ...urls]);
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) setCommentError(failure.reason instanceof Error ? failure.reason.message : t("reviewImageUploadFailed"));
    } finally {
      setUploadingCommentImages(false);
      input.value = "";
    }
  }
  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentError(""); setCommentNotice(""); setPostingComment(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: commentText, rating: commentRating, images: commentImages }) });
      const result = await response.json() as { item?: ProductComment; error?: string };
      const item = result.item;
      if (!response.ok || !item) throw new Error(response.status === 401 ? t("signInToComment") : response.status === 403 ? t("commentNotAllowed") : response.status === 429 ? t("commentRateLimited") : result.error || t("commentPostFailed"));
      setComments((current) => [item, ...current].slice(0, 100));
      setCommentText("");
      setCommentRating(5);
      setCommentImages([]);
      setCommentNotice(t("commentPosted"));
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : t("commentPostFailed"));
    } finally { setPostingComment(false); }
  }

  const hasVariants = Boolean(product?.variants?.length);
  const hasColorVariants = Boolean(product?.variants?.length && product.variants.every((variant) => variant.colorHex));
  const selectedVariant = product?.variants?.find((variant) => variant._id === selectedVariantId);
  const pricing = useMemo(() => product ? resolveProductPricing(product, selectedVariantId) : null, [product, selectedVariantId]);
  if (error) return <div className="page-shell"><p>{error}</p><Link className="button-primary" href="/products">Back to products</Link></div>;
  if (!product || !pricing) return <div className="page-shell">Loading product…</div>;

  const id = product._id ?? product.slug;
  const name = product.title[locale] || product.title.en;
  const description = product.description?.[locale] || product.description?.en || "";
  const images = (product.images ?? []).filter((url) => url.startsWith("https://res.cloudinary.com/"));
  const image = images[selectedImageIndex] ?? images[0] ?? "";
  const unit = product.unit ?? "piece";
  const step = quantityStep(unit);
  const stock = pricing.stock;
  const wishlisted = isWishlisted(id);
  const canAct = stock > 0
    && selectedVariant?.availability !== "out_of_stock"
    && (!hasVariants || Boolean(selectedVariant?._id))
    && isValidQuantity(unit, quantity)
    && quantity <= stock;

  function updateDetailZoomOrigin(event: React.PointerEvent<HTMLDivElement>) {
    const stage = event.currentTarget.querySelector<HTMLDivElement>(".detail-art");
    if (!stage) return false;
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height
      || event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) return false;
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    event.currentTarget.style.setProperty("--zoom-x", `${x}%`);
    event.currentTarget.style.setProperty("--zoom-y", `${y}%`);
    return true;
  }

  function selectProductImage(index: number) {
    setSelectedImageIndex(index);
    setDetailZoomed(false);
  }

  function buyNow() {
    if (tradeRole) { router.push(tradeRole === "reseller" ? "/reseller-center" : "/wholesale-center"); return; }
    if (!product?._id || (hasVariants && !selectedVariant?._id) || !canAct) return;
    const params = new URLSearchParams({ buyNow: product._id, quantity: String(quantity), ...(selectedVariant?._id ? { variantId: selectedVariant._id } : {}) });
    router.push(`/checkout?${params.toString()}`);
  }

  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">Home</Link> / <Link href="/products">Products</Link> / {name}</div>
    <div className="product-detail">
      <div
        className="detail-gallery"
        onPointerEnter={(event) => {
          if ((event.pointerType === "mouse" || event.pointerType === "pen") && updateDetailZoomOrigin(event)) {
            setDetailZoomed(true);
          }
        }}
        onPointerMove={(event) => {
          if ((event.pointerType === "mouse" || event.pointerType === "pen") && updateDetailZoomOrigin(event)) {
            setDetailZoomed(true);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" || event.pointerType === "pen") {
            const preview = event.currentTarget.querySelector(".detail-zoom-preview");
            if (event.relatedTarget instanceof Node && preview?.contains(event.relatedTarget)) return;
            setDetailZoomed(false);
          }
        }}
      >
        <div
          className={`detail-art${detailZoomed ? " is-zoomed" : ""}`}
        >
          {image ? <Image key={image} src={image} alt={`${name} - image ${selectedImageIndex + 1}`} width={800} height={800} sizes="(max-width: 900px) 100vw, 50vw" unoptimized loading="eager" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 5, background: "var(--image-bg)" }} /> : "◉"}
          <button
            type="button"
            className="detail-zoom-toggle"
            aria-controls="product-detail-zoom-preview"
            aria-label={detailZoomed ? t("zoomOutProductImage") : t("zoomProductImage")}
            aria-pressed={detailZoomed}
            title={detailZoomed ? t("zoomOutProductImage") : t("zoomProductImage")}
            onClick={() => setDetailZoomed((current) => !current)}
          >
            {detailZoomed ? <ZoomOut size={19} /> : <ZoomIn size={19} />}
          </button>
          {images.length > 1 && <>
            <button type="button" className="detail-gallery-arrow detail-gallery-prev" aria-label="Previous product image" onClick={() => selectProductImage((selectedImageIndex - 1 + images.length) % images.length)}>‹</button>
            <button type="button" className="detail-gallery-arrow detail-gallery-next" aria-label="Next product image" onClick={() => selectProductImage((selectedImageIndex + 1) % images.length)}>›</button>
          </>}
        </div>
        {images.length > 1 && <div className="detail-gallery-thumbs" aria-label="Product images">
          {images.map((url, index) => <button type="button" key={`${url}-${index}`} className={index === selectedImageIndex ? "active" : ""} aria-label={`Show product image ${index + 1}`} aria-current={index === selectedImageIndex ? "true" : undefined} onClick={() => selectProductImage(index)}><Image src={url} alt="" width={80} height={80} unoptimized /></button>)}
        </div>}
        {detailZoomed && image && <div id="product-detail-zoom-preview" className="detail-zoom-preview" aria-hidden="true">
          <Image src={image} alt="" width={800} height={800} unoptimized draggable={false} />
        </div>}
      </div>
      <div className="detail-copy">
        <p className="eyebrow">{product.category?.name?.[locale] || "Store product"}</p>
        <h1>{name}</h1>
        <div className="detail-price" style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong>{formatBdt(pricing.current)}</strong>
          {pricing.discountPercent > 0 ? <del style={{ color: "var(--muted)", fontSize: 15 }}>{formatBdt(pricing.original)}</del> : null}
          {pricing.discountPercent > 0 ? <span className="sale-tag" style={{ position: "static" }}>{pricing.discountPercent}% OFF</span> : null}
        </div>
        <p>{description}</p>
        {hasVariants && <div className="product-option-field">
          <p className="product-option-label">{hasColorVariants ? t("productColorVariant") : t("productOption")}</p>
          <div className="product-variant-options" role="group" aria-label={hasColorVariants ? t("productColorVariant") : t("productOption")}>
            {product.variants!.map((variant) => <button type="button" key={variant._id} className={`product-variant-option${selectedVariantId === variant._id ? " selected" : ""}`} aria-pressed={selectedVariantId === variant._id} disabled={variant.stock <= 0 || variant.availability === "out_of_stock"} onClick={() => {
              setSelectedVariantId(variant._id ?? "");
              setQuantity(step);
              const variantImage = variant.images?.find((url) => url.startsWith("https://"));
              if (variantImage) {
                const index = images.indexOf(variantImage);
                if (index >= 0) setSelectedImageIndex(index);
              }
            }}>
              <strong>{variant.colorHex && <span className="colour-swatch" style={{ background: variant.colorHex, marginRight: 7 }} />}{variant.label}</strong>
              <span>{formatBdt(variant.price)}</span>
              <small>{variant.stock > 0 ? `${variant.stock} ${t("inStock")}` : t("outOfStock")}</small>
            </button>)}
          </div>
        </div>}
        <p>{stock <= 0 ? t("outOfStock") : `${stock} ${unitLabel(unit, locale)} ${t("inStock")}`}</p>
        {stock > 0 && <div className="field product-quantity-field"><label htmlFor="product-quantity">Quantity ({unitLabel(unit, locale)})</label><input id="product-quantity" type="number" min={step} max={stock} step={step} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div>}
        {tradeRole ? <div className="product-detail-actions" style={{ flexWrap: "wrap" }}><p className="form-error" style={{ width: "100%", margin: 0 }}>রিসেলার/হোলসেল ক্রেতা হিসেবে সাধারণ Checkout/কার্ট ব্যবহার করা যাবে না। অর্ডার অনুরোধ (Order Request) পাঠাতে রিসেলার/হোলসেল সেন্টারে যান।</p><Link className="button-primary" href={tradeRole === "reseller" ? "/reseller-center" : "/wholesale-center"}>অর্ডার অনুরোধ (Order Request)</Link><button type="button" className={`button-secondary wishlist-detail-button${wishlisted ? " is-active" : ""}`} aria-pressed={wishlisted} onClick={() => toggleWishlist(product)}><Heart size={16} fill={wishlisted ? "currentColor" : "none"} /> {wishlisted ? "Saved to wishlist" : "Add to wishlist"}</button></div> : <div className="product-detail-actions">
          <button type="button" className="button-primary" disabled={!canAct} onClick={buyNow}><ShoppingBag size={16} /> {t("buyNow")}</button>
          <button type="button" className="button-secondary" disabled={!canAct} onClick={() => addToCart({ id, slug: product.slug, name, image: selectedVariant?.images?.[0] ?? image ?? "", originalPrice: pricing.discountPercent > 0 ? pricing.original : undefined, price: pricing.current, quantity, unit, ...(selectedVariant?._id ? { variantId: selectedVariant._id, variantLabel: selectedVariant.label, variantImage: selectedVariant.images?.[0] } : {}) })}>{t("addToCart")}</button>
          <button type="button" className={`button-secondary wishlist-detail-button${wishlisted ? " is-active" : ""}`} aria-pressed={wishlisted} onClick={() => toggleWishlist(product)}><Heart size={16} fill={wishlisted ? "currentColor" : "none"} /> {wishlisted ? "Saved to wishlist" : "Add to wishlist"}</button>
        </div>}
        <p className="subtle">{t("secureCheckout")}</p>
      </div>
    </div>
    {product.productDetails?.trim() && <section className="product-specifications" aria-labelledby="product-specifications-title">
      <h2 id="product-specifications-title">{t("productSpecifications")}</h2>
      <p>{product.productDetails}</p>
    </section>}
    <section className="product-comments" aria-labelledby="product-comments-title">
      <h2 id="product-comments-title">{t("productComments")}</h2>
      <form className="product-comment-form" onSubmit={submitComment}>
        <label>{t("reviewRating")}</label>
        <div className="review-rating-input" role="group" aria-label={t("reviewRating")}>
          {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating} stars`} aria-pressed={commentRating === rating} className={rating <= commentRating ? "selected" : ""} onClick={() => setCommentRating(rating)}>★</button>)}
        </div>
        <label htmlFor="product-comment-message">{t("leaveComment")}</label>
        <textarea id="product-comment-message" value={commentText} onChange={(event) => setCommentText(event.target.value)} required minLength={2} maxLength={2000} rows={4} placeholder={t("commentPlaceholder")} />
        <label htmlFor="product-review-images">{t("reviewImages")}</label>
        <input id="product-review-images" type="file" accept="image/*" multiple disabled={uploadingCommentImages || commentImages.length >= 4} onChange={uploadCommentImages} />
        {commentImages.length > 0 && <div className="product-comment-images">{commentImages.map((url, index) => <div className="product-comment-image" key={`${url}-${index}`}><Image src={url} alt={`${t("reviewImages")} ${index + 1}`} width={120} height={120} unoptimized /><button type="button" aria-label={`${t("removeReviewImage")} ${index + 1}`} onClick={() => setCommentImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>{t("removeReviewImage")}</button></div>)}</div>}
        <button className="button-primary" disabled={postingComment || uploadingCommentImages || commentText.trim().length < 2}>{uploadingCommentImages ? t("uploadingSecurely") : postingComment ? t("postingComment") : t("postComment")}</button>
      </form>
      {commentError && <p className="form-error" role="alert">{commentError}{commentError === t("signInToComment") && <> <Link href="/account">{t("signIn")}</Link></>}</p>}
      {commentNotice && <p className="form-success" role="status">{commentNotice}</p>}
      {loadingComments ? <p className="subtle">{t("loadingComments")}</p> : comments.length === 0 ? <p className="subtle">{t("noComments")}</p> : <div className="product-comment-list">
        {comments.map((comment) => <article className="product-comment-card" key={comment._id}>
          <header><strong>{comment.customerName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-BD")}</time></header>
          {comment.rating !== undefined && <div className="product-review-stars" aria-label={`${comment.rating} out of 5 stars`}>{"★".repeat(comment.rating)}{"☆".repeat(5 - comment.rating)}</div>}
          <p>{comment.message}</p>
          {comment.images?.length ? <div className="product-comment-images">{comment.images.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer"><Image src={url} alt={`${t("reviewImages")} ${index + 1}`} width={160} height={160} unoptimized /></a>)}</div> : null}
          {comment.adminReply && <div className="product-comment-reply"><strong>{t("teamReplied")}</strong><p>{comment.adminReply}</p>{comment.repliedAt && <time dateTime={comment.repliedAt}>{new Date(comment.repliedAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-BD")}</time>}</div>}
        </article>)}
      </div>}
    </section>
  </div>;
}
