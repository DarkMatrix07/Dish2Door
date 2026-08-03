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
            "Dish2Door delivers only to the VIT-AP and SRM-AP campuses in Andhra Pradesh, India. We do not deliver anywhere else, so orders expecting delivery outside these two campuses cannot be fulfilled or refunded."
          ]
        },
        {
          title: "Everything is handled on WhatsApp",
          body: [
            "There is no cancellation or refund button on this website, and refunds are not raised automatically through the payment gateway. Every cancellation, refund, or order problem is handled directly by our team on WhatsApp.",
            "Message us on 63022 50978 with your tracking code and the phone number you ordered with. That is the only channel for these requests, and it is the fastest way to get a real answer from a person."
          ],
          action: { label: "Message us on WhatsApp", href: "https://wa.me/916302250978" }
        },
        {
          title: "Cancelling an order",
          body: [
            "Message us as early as possible. Once the restaurant has accepted, prepared, packed, or dispatched your order, it can no longer be cancelled — the food has already been made.",
            "We may also cancel an order ourselves if an item runs out, your contact details are invalid, payment verification fails, the ordering window has closed, or the order looks fraudulent. If we cancel before the food is prepared, we will sort it out with you on WhatsApp."
          ]
        },
        {
          title: "When we will make it right",
          body: [
            "We step in where money was taken but you did not get what you paid for: a duplicate payment, money debited without an order being created, an order we cancelled before preparation, or an order we could not deliver.",
            "We also help with a wrong item, a missing item, or a genuine food quality problem. Message us soon after delivery with your tracking code and photos where possible."
          ]
        },
        {
          title: "When we normally cannot help",
          body: [
            "If the order was prepared correctly and delivery failed for reasons on your side, we usually cannot offer money back. That includes an unreachable phone number, a wrong hostel block, not collecting from the campus gate within a reasonable time, or refusing a correct order.",
            "Most orders are cooked and delivered within a short same-day window, so once food is prepared it cannot be resold. Please order carefully and check your campus and delivery details before paying."
          ]
        },
        {
          title: "How a resolution is agreed",
          body: [
            "Because these cases are handled by a person rather than an automated system, we review each one individually and agree the outcome with you directly on WhatsApp. Depending on what happened, that may be a replacement, an adjustment on a future order, or money returned.",
            "We aim to reply on the same ordering day. If you message us outside our ordering hours, we will get back to you when ordering next opens."
          ]
        }
      ]}
    />
  );
}
