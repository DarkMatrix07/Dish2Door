BEGIN;
-- Security remediation: retain payments, reserve coupons, scope delivery, audit.
-- Does not grant campus access to legacy block-only assignments.

CREATE TYPE "CheckoutState" AS ENUM ('OPEN', 'EXPIRED', 'ABANDONED');
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONSUMED', 'RELEASED');
CREATE TYPE "CaptureState" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED');
CREATE TYPE "RefundState" AS ENUM ('NONE', 'REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ReviewTokenPurpose" AS ENUM ('REVIEW');

ALTER TABLE "Order" ADD COLUMN "checkoutState" "CheckoutState" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Order" ADD COLUMN "quoteExpiresAt" TIMESTAMP(3);

ALTER TABLE "Coupon" ADD COLUMN "heldCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer" ADD COLUMN "identityVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Payment" ADD COLUMN "captureState" "CaptureState" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Payment" ADD COLUMN "refundState" "RefundState" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Payment" ADD COLUMN "refundAmountPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "refundReference" TEXT;

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique gateway ids only when present and not duplicated historically.
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId") WHERE "razorpayOrderId" IS NOT NULL;
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId") WHERE "razorpayPaymentId" IS NOT NULL;

CREATE TABLE "DeliveryAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campusId" TEXT,
    "hostelBlock" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryAssignment_userId_campusId_hostelBlock_key" ON "DeliveryAssignment"("userId", "campusId", "hostelBlock");
CREATE INDEX "DeliveryAssignment_userId_idx" ON "DeliveryAssignment"("userId");

ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy block lists become unresolved assignments (campusId null) and grant no access.
INSERT INTO "DeliveryAssignment" ("id", "userId", "campusId", "hostelBlock")
SELECT DISTINCT md5(u."id" || ':' || block || ':legacy'), u."id", NULL::text, block
FROM "User" u
CROSS JOIN LATERAL unnest(u."assignedHostelBlocks") AS block
WHERE block <> '';

CREATE TABLE "CouponReservation" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CouponReservation_orderId_key" ON "CouponReservation"("orderId");
CREATE INDEX "CouponReservation_couponId_status_idx" ON "CouponReservation"("couponId", "status");

ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CheckoutAttempt" (
    "id" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "capabilityHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutAttempt_idempotencyKeyHash_key" ON "CheckoutAttempt"("idempotencyKeyHash");
CREATE UNIQUE INDEX "CheckoutAttempt_orderId_key" ON "CheckoutAttempt"("orderId");
CREATE INDEX "CheckoutAttempt_capabilityHash_idx" ON "CheckoutAttempt"("capabilityHash");

ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReviewToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "ReviewTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewToken_tokenHash_key" ON "ReviewToken"("tokenHash");
CREATE INDEX "ReviewToken_orderId_idx" ON "ReviewToken"("orderId");

ALTER TABLE "ReviewToken" ADD CONSTRAINT "ReviewToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentEvent" (
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "amountPaise" INTEGER,
    "currency" TEXT,
    "eventType" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX "PaymentEvent_razorpayOrderId_idx" ON "PaymentEvent"("razorpayOrderId");

ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE INDEX "OutboxEvent_orderId_idx" ON "OutboxEvent"("orderId");

ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PaymentEvent_processedAt_nextAttemptAt_idx" ON "PaymentEvent"("processedAt", "nextAttemptAt");

-- Reserve legacy payable quotes before new checkouts may consume capacity. Excess
-- legacy quotes take the explicit refund-review path on capture, never over-redeem.
WITH pending AS (
  SELECT o."id", c."id" AS "couponId", c."maxUses", c."usedCount",
         row_number() OVER (PARTITION BY c."id" ORDER BY o."createdAt", o."id") AS position
  FROM "Order" o JOIN "Coupon" c ON c."code" = o."couponCode"
  WHERE o."source" = 'CUSTOMER_ONLINE' AND o."paymentStatus" = 'PENDING'
    AND o."status" <> 'CANCELLED'
)
INSERT INTO "CouponReservation" ("id", "couponId", "orderId", "expiresAt")
SELECT md5('legacy-reservation:' || "id"), "couponId", "id", CURRENT_TIMESTAMP
FROM pending WHERE "maxUses" IS NULL OR position <= GREATEST(0, "maxUses" - "usedCount");
UPDATE "Coupon" c SET "heldCount" = (
  SELECT count(*) FROM "CouponReservation" r WHERE r."couponId" = c."id" AND r."status" = 'HELD'
);
UPDATE "Payment" SET "captureState" = 'CAPTURED' WHERE "status" IN ('PAID_ONLINE', 'REFUNDED');
COMMIT;
