"use client";

import { useStore } from "@/components/store-context";
import { TradeInquiryForm } from "@/components/trade-inquiry-form";

export default function ResellerPage() {
  const { t } = useStore();
  return <div className="page-shell">
    <p className="breadcrumb">{t("home")} / {t("resellerPageTitle")}</p>
    <h1 className="page-title">{t("resellerPageTitle")}</h1>
    <TradeInquiryForm type="reseller" />
  </div>;
}
