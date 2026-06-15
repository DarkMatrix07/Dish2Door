import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Dish2Door"
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="15 June 2026"
      sections={[
        {
          title: "Information we collect",
          body: [
            "Dish2Door collects the details needed to place and deliver your order, including name, phone number, email address, delivery preference, hostel block when selected, order items, payment status, and rating feedback.",
            "Customers do not need an account. Order tracking works through a private tracking link and passcode."
          ]
        },
        {
          title: "How we use information",
          body: [
            "We use order information to confirm orders, coordinate delivery, send email and WhatsApp updates, verify payments, support customer queries, and improve food and delivery quality.",
            "Admin and delivery users may access order details only for operational purposes."
          ]
        },
        {
          title: "Payments",
          body: [
            "Online payments are processed through Razorpay. Dish2Door verifies payment status server-side and stores payment references needed for order support and reconciliation.",
            "We do not store card, UPI PIN, net banking password, or similar sensitive payment credentials."
          ]
        },
        {
          title: "Notifications",
          body: [
            "We may send order updates by email, WhatsApp, and Telegram-based admin alerts. Notification attempts may be logged with success or failure status for support and retry purposes."
          ]
        },
        {
          title: "Data retention",
          body: [
            "Order, payment reference, notification, and rating records may be retained for operational, accounting, dispute resolution, and service improvement needs.",
            "If you want a correction or deletion request reviewed, contact the Dish2Door admin using the contact details on this website."
          ]
        }
      ]}
    />
  );
}
