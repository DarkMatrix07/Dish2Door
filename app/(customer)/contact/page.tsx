import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/LegalPage";

export const metadata: Metadata = {
  title: "Contact | Dish2Door"
};

export default function ContactPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Contact Dish2Door"
      updated="15 June 2026"
      sections={[
        {
          title: "Customer support",
          body: [
            "For order help, keep your tracking code and phone number ready. This helps the admin find your order quickly.",
            "Contact number: 63022 50978. You can call or message us on WhatsApp using the button below."
          ],
          action: { label: "Chat on WhatsApp", href: "https://wa.me/916302250978" }
        },
        {
          title: "Order issues",
          body: [
            "Reach out for payment confirmation issues, missing tracking messages, delivery coordination, incorrect item concerns, or refund review requests.",
            "For hostel delivery, please mention your hostel block clearly."
          ]
        },
        {
          title: "Business details",
          body: [
            "Business name: Dish2Door.",
            "Operating location: Vijayawada, Andhra Pradesh, India.",
            "Dish2Door operates as a campus food ordering service and does not have a physical customer office. Support is handled through the contact number and WhatsApp listed above."
          ]
        }
      ]}
    />
  );
}
