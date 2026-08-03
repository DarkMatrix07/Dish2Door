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
      updated="3 August 2026"
      sections={[
        {
          title: "Who this applies to",
          body: [
            "Dish2Door is a campus food ordering service operating only at the VIT-AP and SRM-AP campuses in Andhra Pradesh, India. This policy covers the information we handle when you order through this website."
          ]
        },
        {
          title: "Information we collect",
          body: [
            "To place and deliver an order we collect your name, phone number, email address, chosen campus, delivery preference, hostel block where you select hostel delivery, the items you ordered, your payment status, and any rating or review you submit.",
            "You do not need to create an account. Order tracking works through a private link and passcode sent to you.",
            "Your phone number is also used as the key that links your past orders together, so we can show your order history and work out reward eligibility."
          ]
        },
        {
          title: "How we use your information",
          body: [
            "We use it to confirm and deliver your order, send you updates, verify payments, answer your support questions, and improve food and delivery quality.",
            "We also use order history in aggregate to decide which dishes to feature and which offers to run. Our admin and delivery staff can see order details, but only as needed to prepare and deliver orders."
          ]
        },
        {
          title: "Who we share it with",
          body: [
            "We share only what is necessary: your order details with the partner restaurant preparing it, your name, phone number and delivery point with the person delivering it, and payment details with our payment provider.",
            "We do not sell your personal information, and we do not share it for third-party advertising."
          ]
        },
        {
          title: "Payments",
          body: [
            "Online payments are processed by Razorpay. Payment is confirmed on our servers and we keep the payment reference needed for order support, refunds, and accounting.",
            "We never see or store your card number, UPI PIN, net banking password, or any similar credential. Those are handled entirely by the payment provider."
          ]
        },
        {
          title: "Notifications",
          body: [
            "We send order updates by email and WhatsApp, and internal alerts to our own admin channels. We may also send a small number of reminders asking you to rate a delivered order; these stop as soon as you rate it.",
            "We log whether each notification succeeded or failed so we can retry it and investigate delivery problems."
          ]
        },
        {
          title: "How long we keep it",
          body: [
            "We keep order, payment reference, notification, and rating records for as long as needed for operations, accounting, and resolving disputes.",
            "You can ask us to correct or delete your personal details by contacting us with the phone number you ordered with. Some records may be retained where we are required to keep them for accounting or legal reasons."
          ]
        },
        {
          title: "Contact",
          body: [
            "For any privacy question or request, contact us using the phone number and WhatsApp details on our contact page."
          ]
        }
      ]}
    />
  );
}
