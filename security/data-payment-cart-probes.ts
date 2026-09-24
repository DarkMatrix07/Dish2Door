// Focused follow-up audit. Runs ONLY against synthetic in-memory fixtures.
// No .env loading, database, web server, gateway or messaging service is used.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const paymentSecret = "isolated-payment-audit-secret";
process.env.RAZORPAY_KEY_SECRET = paymentSecret;
process.env.RAZORPAY_WEBHOOK_SECRET = paymentSecret;
await import("./audit-probes"); // Installs fake Prisma, blocks fetch, runs baseline probes.
const db = (globalThis as any).prisma;
const service = await import("../lib/orders");
const verification = await import("../app/api/orders/verify-payment/route");
const webhook = await import("../app/api/webhooks/razorpay/route");
const tracking = await import("../app/api/tracking/[trackingCode]/verify/route");
const codes = await import("../lib/order-codes");
const campusService = await import("../lib/campus");
const createPayment = await import("../app/api/orders/create-payment/route");
const post = (body: unknown) => new Request("http://audit.invalid/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const passed: string[] = [];
const pass = (message: string) => { passed.push(message); console.log(message); };

const customer = { name: "Fixture Buyer", phone: "9000000001", email: "buyer@example.invalid", deliveryType: "GATE" as const };
for (const quantity of [-1, 0, 1.5, 21]) {
  const invalid = await createPayment.POST(post({ customer: { ...customer, orderSlot: "NIGHT" }, items: [{ menuItemId: "fixture-item", quantity }] }));
  assert.equal(invalid.status, 400);
  pass(`CONTROL PASSED: checkout route rejects quantity ${quantity}.`);
}
const priceOrder = await service.createPendingOnlineOrder(
  { ...customer, totalPaise: 1, platformFeePaise: -99999 } as any,
  [{ menuItemId: "fixture-item", quantity: 1, pricePaise: 1, discountPercent: 100 } as any]
);
assert.equal(priceOrder.totalPaise, 10000);
pass("CONTROL PASSED: injected cart price, discount and total do not replace server pricing.");

const duplicateOrder = await service.createPendingOnlineOrder(customer, [
  { menuItemId: "fixture-item", quantity: 20 },
  { menuItemId: "fixture-item", quantity: 20 }
]);
assert.equal(duplicateOrder.subtotalPaise, 400000);
pass("CONFIRMED: duplicate cart lines allow 40 units of one item despite the per-line cap of 20; all units are charged.");

const oldCampusLookup = db.campus.findUnique;
db.campus.findUnique = async (args: any) => ({ ...(await oldCampusLookup(args)), active: false });
assert.equal((await campusService.resolveCampus("VIT_AP")).active, false);
const inactiveOrder = await service.createPendingOnlineOrder(customer, [{ menuItemId: "fixture-item", quantity: 1 }]);
assert.equal(inactiveOrder.campusId, "audit-campus");
db.campus.findUnique = oldCampusLookup;
pass("CONFIRMED: disabled default campus is accepted by fallback and an order is created for it.");

const payments = new Map<string, any>([
  ["A", { id: "A", trackingCode: "AUDITAA", paymentStatus: "PENDING", couponCode: null }],
  ["B", { id: "B", trackingCode: "AUDITBB", paymentStatus: "PENDING", couponCode: null }]
]);
let calls = 0;
db.payment.findFirst = async ({ where }: any) => { calls++; return where.razorpayOrderId === "rp-A" ? { orderId: "A" } : null; };
db.$transaction = async (fn: any) => fn(db);
db.order.updateMany = async ({ where, data }: any) => {
  const row = payments.get(where.id);
  if (!row || row.paymentStatus !== where.paymentStatus) return { count: 0 };
  Object.assign(row, data);
  return { count: 1 };
};
db.order.update = async ({ where }: any) => payments.get(where.id);
db.order.findUnique = async ({ where }: any) => payments.get(where.id) ?? null;
// The baseline notification code could read our synthetic paid rows; disable sends.
db.systemSettings.upsert = async () => ({ notifyEmail: false, notifyWhatsapp: false });
db.notificationLog = { create: async () => ({}) };
// Explicitly clear the optional Telegram provider configuration for these fixtures.
const { env } = await import("../lib/env");
env.TELEGRAM_BOT_TOKEN = undefined;
env.TELEGRAM_GROUP_ID = undefined;

const forged = await verification.POST(post({ orderId: "B", razorpayOrderId: "rp-A", razorpayPaymentId: "pay-A", razorpaySignature: "forged" }));
assert.equal(forged.status, 400);
assert.equal(calls, 0);
pass("CONTROL PASSED: forged signature is rejected before payment lookup or order mutation.");

const signed = { orderId: "B", razorpayOrderId: "rp-A", razorpayPaymentId: "pay-A", razorpaySignature: createHmac("sha256", paymentSecret).update("rp-A|pay-A").digest("hex") };
const first = await verification.POST(post(signed));
const firstBody = await first.json();
assert.equal(first.status, 200);
assert.equal(firstBody.trackingCode, "AUDITAA");
assert.equal(payments.get("B").paymentStatus, "PENDING");
assert.deepEqual(Object.keys(firstBody).sort(), ["passcode", "trackingCode"]);
pass("CONTROL PASSED: signed payment A cannot confirm client-supplied order B; response contains only tracking code and passcode.");

const replay = await verification.POST(post(signed));
assert.equal((await replay.json()).passcode, null);
pass("CONTROL PASSED: replay of an already confirmed payment does not reissue the plaintext passcode.");

const eventText = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "late-payment", order_id: "deleted-gateway-order" } } } });
const late = await webhook.POST(new Request("http://audit.invalid/", {
  method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", paymentSecret).update(eventText).digest("hex") }, body: eventText
}));
assert.equal(late.status, 200);
pass("CONFIRMED: valid captured-payment webhook with a missing local mapping is acknowledged with HTTP 200.");

const fixture = {
  id: "tracking-fixture", trackingCode: "AUDITCC", trackingPasscodeHash: await codes.hashPasscode("1234"),
  status: "DELIVERED", customerName: "Synthetic Student", customerEmail: "student@example.invalid", customerPhone: "9000000001",
  deliveredAt: new Date("2020-01-01"), receivedBy: "Synthetic Roommate", deliveryNote: "Synthetic handover note",
  deliveredBy: { id: "worker-fixture", name: "Fixture Worker", phone: "9000000002" },
  session: { id: "internal-session", label: "Internal session" }, items: [], restaurant: { name: "Fixture Shop" }
};
db.order.findUnique = async ({ where }: any) => where.trackingCode === fixture.trackingCode ? fixture : null;
const params = { params: Promise.resolve({ trackingCode: fixture.trackingCode }) };
const exposed = await tracking.POST(post({ passcode: "1234" }), params);
const exposedBody = await exposed.json();
assert.equal(exposed.status, 200);
assert.equal(exposedBody.order.trackingPasscodeHash, undefined);
assert.equal(exposedBody.order.deliveredBy.phone, "9000000002");
assert.equal(exposedBody.order.receivedBy, "Synthetic Roommate");
assert.equal(exposedBody.order.deliveryNote, "Synthetic handover note");
assert.equal(exposedBody.order.session.id, "internal-session");
pass("CONFIRMED: valid tracking PIN returns worker phone, receiver name, handover note and internal session metadata; hash is stripped.");

const reviewPin = codes.generateReviewPasscode(fixture.trackingCode);
const oldReview = await tracking.POST(post({ passcode: reviewPin }), params);
assert.equal(oldReview.status, 200);
pass("CONFIRMED: review PIN unlocks full order data for a synthetic order delivered in 2020; no expiry enforced.");

const unknown = await tracking.POST(post({ passcode: "1234" }), { params: Promise.resolve({ trackingCode: "UNKNOWN" }) });
assert.equal(unknown.status, 404);
const wrongPin = ["2345", "3456"].find(p => p !== reviewPin)!;
for (let i = 0; i < 8; i++) assert.equal((await tracking.POST(post({ passcode: wrongPin }), params)).status, 401);
assert.equal((await tracking.POST(post({ passcode: "1234" }), params)).status, 429);
pass("CONFIRMED: wrong PIN reveals no order data, but eight failures on a known code temporarily block even its correct PIN.");

console.log(`${passed.length} focused checks passed, plus the four baseline behavior probes. No live-service exploitation tested.`);
