import test from "node:test";
test("coupon expiry, legacy capture, compensation and login regression probes", async () => {
  await import("../security/branch-review-probes");
});
