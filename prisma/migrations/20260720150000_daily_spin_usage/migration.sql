-- Explicitly close rewards whose coupons are already unusable.
ALTER TABLE "SpinReward" ADD COLUMN "expiredAt" TIMESTAMP(3);

-- Historical orders stored exactly what the customer typed. Normalize valid
-- Indian numbers once so loyalty counts use exact indexed-safe comparisons.
UPDATE "Order"
SET "customerPhone" = right(regexp_replace("customerPhone", '[^0-9]', '', 'g'), 10)
WHERE length(regexp_replace("customerPhone", '[^0-9]', '', 'g')) >= 10;

UPDATE "SpinReward" AS reward
SET "expiredAt" = CURRENT_TIMESTAMP
FROM "Coupon" AS coupon
WHERE reward."couponCode" = coupon."code"
  AND reward."redeemedAt" IS NULL
  AND (
    coupon."active" = false
    OR (coupon."expiresAt" IS NOT NULL AND coupon."expiresAt" <= CURRENT_TIMESTAMP)
    OR (coupon."maxUses" IS NOT NULL AND coupon."usedCount" >= coupon."maxUses")
  );

DROP INDEX IF EXISTS "SpinReward_phone_outstanding_key";
CREATE UNIQUE INDEX "SpinReward_phone_outstanding_key"
ON "SpinReward"("phone")
WHERE "redeemedAt" IS NULL AND "expiredAt" IS NULL;

CREATE TABLE "SpinUsage" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "spinDay" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpinUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpinUsage_phone_spinDay_key" ON "SpinUsage"("phone", "spinDay");
CREATE INDEX "SpinUsage_spinDay_idx" ON "SpinUsage"("spinDay");

-- Preserve today's decisions made immediately before this migration. IDs are
-- deterministic so the backfill remains idempotent if migration recovery retries.
INSERT INTO "SpinUsage" ("id", "phone", "spinDay", "outcome", "createdAt")
SELECT
  'backfill_' || md5(reward."phone" || reward."createdAt"::text),
  reward."phone",
  to_char(reward."createdAt" + interval '5 hours 30 minutes', 'YYYY-MM-DD'),
  'SPUN',
  reward."createdAt"
FROM "SpinReward" AS reward
ON CONFLICT ("phone", "spinDay") DO NOTHING;

INSERT INTO "SpinUsage" ("id", "phone", "spinDay", "outcome", "createdAt")
SELECT
  'forfeit_' || md5(loyalty."phone" || loyalty."updatedAt"::text),
  loyalty."phone",
  to_char(loyalty."updatedAt" + interval '5 hours 30 minutes', 'YYYY-MM-DD'),
  'FORFEITED',
  loyalty."updatedAt"
FROM "CustomerLoyalty" AS loyalty
WHERE loyalty."wheelConsumed" = true
ON CONFLICT ("phone", "spinDay") DO NOTHING;
