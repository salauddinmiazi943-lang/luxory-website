"use client";

import { BusinessApplicationForm } from "@/components/business-application-form";
import { useStore } from "@/components/store-context";

export default function BusinessApplicationPage() {
  const { t } = useStore();
  return <div className="page-shell"><p className="breadcrumb">{t("home")} / {t("resellerWholesaler")}</p><h1 className="page-title">{t("businessApplicationTitle")}</h1><p className="subtle" style={{ marginBottom: 25 }}>{t("businessApplicationIntro")}</p><BusinessApplicationForm /></div>;
}
