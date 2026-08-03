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
      updated="3 August 2026"
      sections={[
        {
          title: "Service area",
          body: [
            "Dish2Door delivers only to the VIT-AP and SRM-AP campuses in Andhra Pradesh, India. Orders that cannot be delivered because a location outside these two campuses was expected are not eligible for a refund, since we do not serve those areas."
          ]
        },
        {
          title: "Cancellation requests",
          body: [
            "Please request a cancellation as early as possible by contacting us on the number listed on our contact page, quoting your tracking code. Once the restaurant has accepted, prepared, packed, or dispatched your order, it can no longer be cancelled.",
            "We may cancel an order ourselves if an item becomes unavailable, your contact details are invalid, payment verification fails, the ordering window has closed, or the order appears fraudulent."
          ]
        },
        {
          title: "When a refund applies",
          body: [
            "A refund is considered where money was taken but no food was delivered: a failed or duplicate payment, an order cancelled before preparation began, or an order we could not fulfil.",
            "A refund is not normally available where the order was prepared correctly and the delivery failed for reasons on the customer's side, such as an unreachable phone number, an incorrect hostel block, not collecting from the campus gate within a reasonable time, or refusing a correct order.",
            "Because most orders are prepared and delivered on the same day within a short window, cancellations after preparation are rare and refunds are the exception rather than the norm."
          ]
        },
        {
          title: "How refunds are paid",
          body: [
            "Approved refunds are returned to the original payment method through our payment provider, Razorpay. We do not refund in cash or to a different account.",
            "Once we approve and initiate a refund, the time it takes to appear in your account depends on your bank or payment provider and is outside our control. Typically this takes a few working days.",
            "Where a refund is issued, payment gateway charges and platform fees may be deducted, depending on the case and the payment provider's rules."
          ]
        },
        {
          title: "Food quality, missing or wrong items",
          body: [
            "If something is wrong with your order, contact us soon after delivery with your tracking code, the phone number used to order, and clear details or photos. Reporting quickly gives us the best chance of resolving it with the restaurant.",
            "Depending on what happened, we may arrange a replacement, a partial adjustment, or a refund. We assess these case by case together with the partner restaurant."
          ]
        }
      ]}
    />
  );
}
