"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { clearStoredCart, readStoredCart, writeStoredCart, type StoredCartItem } from "@/lib/cart";
import { formatPaise } from "@/lib/utils";

type Settings = {
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function paymentFee(basePaise: number, settings: Settings) {
  return Math.ceil((basePaise * settings.paymentChargePercentBps) / 10_000) + settings.paymentChargeFixedPaise;
}

function discountedUnitPrice(item: StoredCartItem) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CartPageClient({ settings }: { settings: Settings }) {
  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    deliveryType: "GATE",
    hostelBlock: ""
  });

  useEffect(() => {
    setCart(readStoredCart());
  }, []);

  function persist(nextCart: StoredCartItem[]) {
    setCart(nextCart);
    writeStoredCart(nextCart);
  }

  function updateQty(id: string, delta: number) {
    persist(
      cart
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function emptyCart() {
    clearStoredCart();
    setCart([]);
  }

  const totals = useMemo(() => {
    const subtotalPaise = cart.reduce((total, item) => total + discountedUnitPrice(item) * item.quantity, 0);
    const couponDiscountPaise = coupon ? Math.round((subtotalPaise * coupon.discountPercent) / 100) : 0;
    const hostelFeePaise = customer.deliveryType === "HOSTEL" ? settings.hostelDeliveryFeePaise : 0;
    const basePaise = Math.max(0, subtotalPaise - couponDiscountPaise) + settings.platformFeePaise + hostelFeePaise;
    const paymentFeePaise = paymentFee(basePaise, settings);
    return {
      subtotalPaise,
      couponDiscountPaise,
      hostelFeePaise,
      paymentFeePaise,
      totalPaise: basePaise + paymentFeePaise
    };
  }, [cart, coupon, customer.deliveryType, settings]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Coupon not valid");
      setCoupon(data);
      toast.success(`${data.code} applied`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Coupon not valid");
    }
  }

  async function checkout() {
    if (!cart.length) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!customer.name || !customer.email || !customer.phone) {
      toast.error("Name, email, and phone are required.");
      return;
    }
    if (customer.deliveryType === "HOSTEL" && !customer.hostelBlock) {
      toast.error("Hostel block is required for hostel delivery.");
      return;
    }

    setBusy(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error("Razorpay checkout could not load");

      const response = await fetch("/api/orders/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { ...customer, couponCode: coupon?.code },
          items: cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity }))
        })
      });
      const payment = await response.json();
      if (!response.ok) throw new Error(payment.error ?? "Could not start payment");

      const checkoutWindow = new window.Razorpay({
        key: payment.razorpayKeyId,
        amount: payment.amountPaise,
        currency: "INR",
        name: "Dish2Door",
        description: cart[0]?.restaurantName,
        order_id: payment.razorpayOrderId,
        prefill: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone
        },
        handler: async (result: Record<string, string>) => {
          const verifyResponse = await fetch("/api/orders/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: payment.orderId,
              razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id,
              razorpaySignature: result.razorpay_signature
            })
          });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) {
            toast.error(verified.error ?? "Payment verification failed");
            return;
          }
          clearStoredCart();
          window.sessionStorage.setItem(`dish2door_passcode_${verified.trackingCode}`, verified.passcode);
          toast.success(`Order confirmed. Passcode: ${verified.passcode}`);
          window.location.href = `/orders/${verified.trackingCode}`;
        }
      });

      checkoutWindow.open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8ec]">
      <header className="border-b border-neutral-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-black">
            Dish2Door
          </Link>
          <Link href="/menu">
            <Button variant="outline">Back to menu</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6">
            <p className="font-semibold text-amber-700">Review carefully</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-neutral-950 sm:text-5xl">Your cart</h1>
            <p className="mt-3 max-w-2xl text-neutral-600">
              Confirm items, delivery choice, contact details, and the final payable amount before checkout.
            </p>
          </div>

          {cart.length ? (
            <div className="space-y-4">
              {cart.map((item) => (
                <Card key={item.id} className="grid gap-4 p-4 sm:grid-cols-[112px_1fr_auto] sm:items-center">
                  <img
                    alt={item.name}
                    className="h-28 w-full rounded-2xl object-cover sm:w-28"
                    src={
                      item.imageUrl ??
                      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85"
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold text-amber-700">{item.restaurantName}</p>
                    <h2 className="text-xl font-black">{item.name}</h2>
                    <p className="mt-1 text-sm text-neutral-500">{item.description}</p>
                    <p className="mt-2 font-bold">
                      {formatPaise(discountedUnitPrice(item))} each
                      {item.discountPercent ? (
                        <span className="ml-2 text-sm font-semibold text-neutral-400 line-through">{formatPaise(item.pricePaise)}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => updateQty(item.id, -1)}>
                        <Minus size={14} />
                      </Button>
                      <span className="w-8 text-center font-black">{item.quantity}</span>
                      <Button variant="outline" size="icon" onClick={() => updateQty(item.id, 1)}>
                        <Plus size={14} />
                      </Button>
                    </div>
                    <p className="text-lg font-black">{formatPaise(discountedUnitPrice(item) * item.quantity)}</p>
                  </div>
                </Card>
              ))}
              <Button variant="ghost" onClick={emptyCart}>
                <Trash2 size={16} /> Clear cart
              </Button>
            </div>
          ) : (
            <Card className="p-10 text-center">
              <ShoppingBag className="mx-auto text-amber-700" />
              <h2 className="mt-4 text-2xl font-black">Your cart is empty</h2>
              <p className="mt-2 text-neutral-500">Add items from the menu and they will appear here.</p>
              <Link href="/menu">
                <Button className="mt-5">Browse menu</Button>
              </Link>
            </Card>
          )}
        </motion.div>

        <aside className="h-fit rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-2xl font-black">Checkout details</h2>
          <div className="mt-5 space-y-3">
            <Input placeholder="Name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
            <Input placeholder="Email" type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
            <Input placeholder="Phone number" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
            <Select value={customer.deliveryType} onChange={(event) => setCustomer({ ...customer, deliveryType: event.target.value })}>
              <option value="GATE">Deliver to gate</option>
              <option value="HOSTEL">Deliver to hostel</option>
            </Select>
            {customer.deliveryType === "HOSTEL" ? (
              <Input
                placeholder="Hostel block"
                value={customer.hostelBlock}
                onChange={(event) => setCustomer({ ...customer, hostelBlock: event.target.value })}
              />
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">Coupon code</p>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Input
                className="uppercase"
                placeholder="HOSTEL10"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              />
              <Button variant="outline" onClick={applyCoupon}>Apply</Button>
            </div>
            {coupon ? <p className="mt-2 text-sm text-emerald-700">{coupon.code} gives {coupon.discountPercent}% off items.</p> : null}
          </div>

          <div className="mt-6 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm">
            <div className="flex justify-between">
              <span>Items subtotal</span>
              <span>{formatPaise(totals.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span>Platform fee</span>
              <span>{formatPaise(settings.platformFeePaise)}</span>
            </div>
            {totals.couponDiscountPaise ? (
              <div className="flex justify-between text-emerald-700">
                <span>Coupon discount</span>
                <span>-{formatPaise(totals.couponDiscountPaise)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>Hostel delivery</span>
              <span>{formatPaise(totals.hostelFeePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span>Online payment handling</span>
              <span>{formatPaise(totals.paymentFeePaise)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg font-black">
              <span>Total</span>
              <span>{formatPaise(totals.totalPaise)}</span>
            </div>
          </div>
          <Button className="mt-5 w-full" size="lg" disabled={busy || !cart.length} onClick={checkout}>
            {busy ? "Starting payment..." : "Proceed to payment"}
          </Button>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            After payment, Dish2Door sends your private tracking link and 4-digit passcode on WhatsApp and email.
          </p>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
