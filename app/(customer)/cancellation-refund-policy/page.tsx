import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/LegalPage";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy | Dish2Door"
};

export default function CancellationRefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Policy"
      title="Cancellation and Refund Policy"
      updated="15 June 2026"
      sections={[
        {
          title: "Cancellation requests",
          body: [
            "Cancellation requests must be made as early as possible by contacting the Dish2Door admin. Once a restaurant has accepted, prepared, packed, or dispatched the order, cancellation may not be possible.",
            "Dish2Door may cancel an order if an item becomes unavailable, customer details are invalid, payment verification fails, or the order appears suspicious."
          ]
        },
        {
          title: "Refund eligibility",
          body: [
            "Refunds may be considered for failed payments, duplicate payments, cancelled orders before preparation, or cases where the order cannot be fulfilled.",
            "Refunds may not be available for incorrect customer details, missed calls, unreachable customer phone numbers, wrong hostel block details, or refusal to accept a correctly prepared order."
          ]
        },
        {
          title: "Refund timeline",
          body: [
            "Approved refunds are processed through the original payment method whenever possible. Bank or payment provider timelines may vary.",
            "Any payment gateway charges or platform fees may be deducted where applicable, depending on the case and payment provider rules."
          ]
        },
        {
          title: "Food quality concerns",
          body: [
            "For food quality, missing item, or wrong item concerns, contact the admin with the order tracking code, customer phone number, and clear details soon after delivery.",
            "Dish2Door may coordinate with the restaurant to provide a suitable resolution."
          ]
        }
      ]}
    />
  );
}
