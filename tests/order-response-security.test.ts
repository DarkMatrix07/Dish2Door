import assert from "node:assert/strict";
import test from "node:test";
import { containsForbiddenField, toAdminOrderView, toDeliveryOrderView, toOrderMutationView } from "../lib/order-views";

const order = {
  id: "order", trackingCode: "TRACK", customerName: "Customer", customerPhone: "9000000001",
  customerEmail: "test@example.invalid", hostelBlock: "A", status: "REACHED_CAMPUS" as const,
  totalPaise: 10000, deliveryType: "HOSTEL" as const, paymentStatus: "PAID_ONLINE",
  orderSlot: "NIGHT" as const, source: "CUSTOMER_ONLINE", createdAt: new Date(),
  trackingPasscodeHash: "secret", razorpaySignature: "secret", futureSecret: "secret",
  restaurant: { name: "Food", passwordHash: "secret" },
  items: [{ id: "item", nameSnapshot: "Meal", quantity: 1, tokenHash: "secret" }],
  session: { id: "session", label: "Dinner", tokenHash: "secret" },
  campus: { id: "campus", code: "C", name: "Campus", passwordHash: "secret" },
  payment: { razorpaySignature: "secret" }, deliveredBy: { passwordHash: "secret" }
};

test("staff response contracts allowlist fields recursively and exclude future secrets", () => {
  for (const serialize of [toAdminOrderView, toDeliveryOrderView, toOrderMutationView]) {
    const result = serialize(order);
    assert.equal(containsForbiddenField(result), false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
    assert.equal(result.id, order.id);
    assert.equal(result.status, order.status);
  }
  assert.equal("customerEmail" in toDeliveryOrderView(order), false);
  assert.deepEqual(toOrderMutationView(order), { id: order.id, status: order.status, paymentStatus: order.paymentStatus });
  assert.deepEqual(toAdminOrderView(order).items, [{ id: "item", nameSnapshot: "Meal", quantity: 1 }]);
});
