import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/LegalPage";
import { activeCampusNamesText } from "@/lib/campus";

export const metadata: Metadata = {
  title: "Contact | Dish2Door"
};

// Reads the live campus list, so it renders per request.
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const campuses = await activeCampusNamesText();
  return (
    <LegalPage
      eyebrow="Support"
      title="Contact Dish2Door"
      updated="29 September 2026"
      sections={[
        {
          title: "Customer support",
          body: [
            "Have your tracking code and the phone number you ordered with ready — that is the fastest way for us to find your order.",
            "Contact number: 63022 50978. Call us, or message on WhatsApp using the button below."
          ],
          action: { label: "Chat on WhatsApp", href: "https://wa.me/916302250978" }
        },
        {
          title: "Where we deliver",
          body: [
            `We serve only these campuses: ${campuses}, in Andhra Pradesh, India. We do not deliver anywhere else.`,
            "At each campus you can collect from the campus gate, and hostel delivery is available where that campus offers it. Where hostel delivery shows as coming soon, only gate pickup is running there for now.",
            "Hostel delivery runs on night orders only. Afternoon orders are gate pickup."
          ]
        },
        {
          title: "Order issues",
          body: [
            "Get in touch about payment confirmation problems, a missing tracking message, delivery coordination, a wrong or missing item, or a cancellation or refund request.",
            "Cancellations and refunds are handled only over WhatsApp or by phone on the number above — there is no cancel or refund option on the website.",
            "For hostel delivery, please mention your hostel block clearly so we can route the order correctly."
          ]
        },
        {
          title: "Business details",
          body: [
            "Business name: Dish2Door.",
            `Operating location: Andhra Pradesh, India, serving the ${campuses} campuses.`,
            "Dish2Door is a campus food ordering service and does not have a walk-in office. All support is handled through the phone number and WhatsApp above."
          ]
        }
      ]}
    />
  );
}
