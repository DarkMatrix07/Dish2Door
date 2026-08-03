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
      updated="3 August 2026"
      sections={[
        {
          title: "Where we deliver",
          body: [
            "Dish2Door delivers to two campuses only: VIT-AP and SRM-AP, in Andhra Pradesh, India. We do not deliver to any other campus, residential address, or location.",
            "You choose your campus before checkout. Please make sure it is correct, because it determines the fees shown and where your order is sent. We cannot redirect an order to a different campus after it is placed."
          ]
        },
        {
          title: "Use of Dish2Door",
          body: [
            "Dish2Door is a campus food ordering service for browsing menus, placing orders, paying online, and tracking order status. We coordinate between partner restaurants and students; we do not cook the food ourselves.",
            "By placing an order you confirm that your name, phone number, email address, campus, delivery choice, and hostel block where applicable are accurate."
          ]
        },
        {
          title: "Menu, availability, and pricing",
          body: [
            "Menu items, combos, prices, discounts, coupons, and availability can change at any time based on restaurant stock and our admin controls. An item may sell out after you add it to your cart.",
            "The amount payable at checkout may include the item subtotal, any coupon discount, a platform fee, a hostel delivery fee where that option is selected, and a payment handling fee. The total shown in your cart before payment is the amount you will be charged.",
            "Fees may differ between campuses. The fees applied are those of the campus you selected, and they are confirmed on our servers when the order is created."
          ]
        },
        {
          title: "Orders and delivery",
          body: [
            "You may choose campus gate pickup, or hostel delivery where that campus offers it. Hostel delivery requires a hostel block and may carry an additional fee. Where hostel delivery is marked as coming soon, only gate pickup is available at that campus.",
            "Orders are accepted within our published ordering window and delivery slots. Slot cut-off times are shown at checkout and orders placed after a cut-off move to the next available slot.",
            "Cancellations, refunds, and order problems are handled only through our WhatsApp support number, not through this website. See our Cancellation and Refund Policy.",
            "Order status is shown as confirmed, reached campus, and delivered. Delivery times are estimates and are not guaranteed, as they depend on restaurant preparation, order volume, traffic, and campus access."
          ]
        },
        {
          title: "Tracking and passcode",
          body: [
            "After your order is confirmed we send a private tracking link and a passcode by email and WhatsApp. Keep the passcode private: anyone who has it can view your order details and submit a rating for that order.",
            "If you do not receive your tracking message, please check your spam folder before contacting support."
          ]
        },
        {
          title: "Ratings and rewards",
          body: [
            "You may rate the food and delivery for a completed order. Ratings help us and our partner restaurants improve, and may be used to decide which dishes we feature.",
            "We may run reward offers, such as a discount wheel unlocked after a number of reviewed orders. Rewards are issued as one-time coupons tied to the phone number that earned them and cannot be transferred, shared, or exchanged for cash. We may withdraw or change an offer at any time."
          ]
        },
        {
          title: "User conduct",
          body: [
            "Do not place fake orders, misuse or share coupons, submit incorrect delivery details, harass restaurant staff or delivery persons, or attempt to access admin or delivery areas without authorisation.",
            "We may cancel orders that appear fraudulent or abusive, and may decline service to repeat offenders."
          ]
        },
        {
          title: "Changes to these terms",
          body: [
            "We may update these terms as the service changes. The date at the top of this page shows when it was last revised, and continued use of Dish2Door means you accept the current version."
          ]
        }
      ]}
    />
  );
}
