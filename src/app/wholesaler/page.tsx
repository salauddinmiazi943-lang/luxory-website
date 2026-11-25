"use client";

import { useStore } from "@/components/store-context";
import { TradeInquiryForm } from "@/components/trade-inquiry-form";

export default function WholesalerPage() {
  const { t } = useStore();
  return <div className="page-shell">
    <p className="breadcrumb">{t("home")} / {t("wholesalerPageTitle")}</p>
    <h1 className="page-title">{t("wholesalerPageTitle")}</h1>
    <TradeInquiryForm type="wholesaler" />
  </div>;
}
