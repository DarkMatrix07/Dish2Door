import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/LegalPage";

export const metadata: Metadata = {
  title: "Terms and Conditions | Dish2Door"
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms and Conditions"
      updated="15 June 2026"
      sections={[
        {
          title: "Use of Dish2Door",
          body: [
            "Dish2Door provides a campus food ordering flow for browsing menus, placing orders, making online payments, and tracking order status.",
            "By placing an order, you confirm that the contact details, delivery choice, and hostel block where applicable are accurate."
          ]
        },
        {
          title: "Menu, availability, and pricing",
          body: [
            "Menu items, prices, discounts, coupons, and availability may change based on restaurant stock and admin controls.",
            "The payable amount shown at checkout may include item subtotal, coupon discount, platform fee, hostel delivery fee when selected, payment handling fee, and applicable taxes or charges shown in the cart."
          ]
        },
        {
          title: "Orders and delivery",
          body: [
            "Customers may choose gate delivery or hostel delivery when available. Hostel delivery requires hostel block details and may include an additional delivery fee.",
            "Order status is shown as confirmed, reached campus, and delivered. Delivery time is not guaranteed unless explicitly communicated by the admin."
          ]
        },
        {
          title: "Tracking and passcode",
          body: [
            "After order confirmation, Dish2Door sends a private tracking link and passcode. Keep the passcode private because it can be used to view order details and submit ratings."
          ]
        },
        {
          title: "User conduct",
          body: [
            "Do not place fake orders, misuse coupons, submit incorrect delivery details, harass delivery persons, or attempt to access admin or delivery areas without authorization.",
            "Dish2Door may cancel suspicious or abusive orders."
          ]
        }
      ]}
    />
  );
}
