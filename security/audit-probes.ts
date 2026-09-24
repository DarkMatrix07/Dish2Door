// Audit evidence only: run with `npx tsx security/audit-probes.ts`.
// Uses in-memory Prisma doubles, no .env loading, no database or provider requests.
import assert from "node:assert/strict";

process.env.DATABASE_URL = "postgresql://audit:audit@127.0.0.1:1/audit";
process.env.BETTER_AUTH_SECRET = "audit-only-not-a-production-secret";
globalThis.fetch = async () => { throw new Error("Network disabled in audit probes"); };

const phone = "9000000001"; // Synthetic fixture; never contacted.
const customer = { phone, name: "Original", email: "original@example.invalid", spinBaseline: 0 };
const coupon = { code: "AUDITONE", active: true, maxUses: 1, usedCount: 0, expiresAt: null, discountPercent: 20 };
const reward = { id: "reward-fixture", phone, couponCode: coupon.code, discountPercent: 20 };
let outstanding = true;
const usage: unknown[] = [];
const orders: any[] = [];
const settings = { ordersOpen: true, orderingOpenMinute: 0, orderingCloseMinute: 1440, spinWheelForEveryone: false };
const campus = { id: "audit-campus", code: "VIT_AP", name: "Fixture", active: true, platformFeePaise: 0, hostelDeliveryFeePaise: 0, paymentChargePercentBps: 0, paymentChargeFixedPaise: 0, hostelDeliveryEnabled: true, hostelDeliveryNightOnly: false };

const tx: any = {
  customer: {
    findUnique: async () => customer,
    upsert: async ({ update }: any) => Object.assign(customer, update)
  },
  spinReward: { findFirst: async () => outstanding ? reward : null },
  spinUsage: { findUnique: async () => null, create: async ({ data }: any) => { usage.push(data); return data; } },
  systemSettings: { upsert: async () => settings },
  campus: { findUnique: async () => campus },
  coupon: {
    findUnique: async () => coupon,
    update: async () => { coupon.usedCount += 1; return coupon; }
  },
  orderSession: { findFirst: async () => ({ id: "fixture-session" }) },
  menuItem: { findMany: async () => [{ id: "fixture-item", restaurantId: "fixture-shop", name: "Fixture food", pricePaise: 10000, discountPercent: 0 }] },
  restaurant: { findUnique: async () => ({ id: "fixture-shop", orderMode: "ONLINE_PAYMENT", acceptingOrders: true }) },
  payment: { create: async ({ data }: any) => data },
  order: {
    count: async () => 3,
    findUnique: async () => null,
    create: async ({ data }: any) => { const row = { id: `fixture-${orders.length}`, ...data }; orders.push(row); return row; },
    updateMany: async ({ where, data }: any) => {
      const row = orders.find(o => o.id === where.id && o.paymentStatus === where.paymentStatus);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    update: async ({ where }: any) => orders.find(o => o.id === where.id)
  }
};
const fakePrisma: any = { ...tx, $transaction: async (work: any) => typeof work === "function" ? work(tx) : Promise.all(work) };
(globalThis as any).prisma = fakePrisma;

const identify = await import("../app/api/customer/identify/route");
const forfeit = await import("../app/api/customer/spin/forfeit/route");
const orderService = await import("../lib/orders");
const { prisma } = await import("../lib/db");
assert.equal(prisma, fakePrisma, "Must use the isolated Prisma double");
const request = (body: unknown) => new Request("http://audit.invalid/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const response = await identify.POST(request({ phone }));
assert.equal(response.status, 200);
const profile = await response.json();
assert.equal(profile.totalReviewed, 3);
assert.equal(profile.reward.couponCode, coupon.code);
console.log("CONFIRMED: cookie-free identify request returns another phone's activity and reward code.");

outstanding = false;
const forfeited = await forfeit.POST(request({ phone }));
assert.equal(forfeited.status, 200);
assert.equal(customer.spinBaseline, 3);
assert.equal(usage.length, 1);
console.log("CONFIRMED: cookie-free forfeit request mutates the supplied phone's loyalty baseline and daily usage.");

const details = { name: "Changed by guest", email: "guest@example.invalid", phone, deliveryType: "GATE" as const, couponCode: coupon.code };
const items = [{ menuItemId: "fixture-item", quantity: 1 }];
const first = await orderService.createPendingOnlineOrder(details, items);
const second = await orderService.createPendingOnlineOrder(details, items);
assert.equal(customer.name, details.name);
assert.equal(customer.email, details.email);
console.log("CONFIRMED: unpaid guest checkout replaces the supplied phone's customer profile.");
assert.equal(first.couponDiscountPaise, 2000);
assert.equal(second.couponDiscountPaise, 2000);
assert.equal(coupon.usedCount, 0);
await orderService.confirmOnlineOrder(first.id, { razorpayOrderId: "fixture-rp-1", razorpayPaymentId: "fixture-pay-1", amountPaise: first.totalPaise, currency: "INR", captured: true });
await orderService.confirmOnlineOrder(second.id, { razorpayOrderId: "fixture-rp-2", razorpayPaymentId: "fixture-pay-2", amountPaise: second.totalPaise, currency: "INR", captured: true });
assert.equal(coupon.usedCount, 2);
assert.equal(first.paymentStatus, "PAID_ONLINE");
assert.equal(second.paymentStatus, "PAID_ONLINE");
console.log("CONFIRMED: two pending discounted orders both confirm despite maxUses=1 (mocked payment inputs; no real payments).");
console.log("4 isolated behavior probes passed. These demonstrate application logic, not production exploitation.");
