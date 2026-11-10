import { Suspense } from "react";
import { CheckoutPage } from "@/components/checkout-page";
export default function CheckoutRoute() { return <Suspense fallback={null}><CheckoutPage /></Suspense>; }
