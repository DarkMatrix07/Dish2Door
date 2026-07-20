-- CustomerLoyalty becomes the Customer spine. A RENAME (not a new table) so live
-- spinBaseline values survive — dropping and recreating would reset every customer's
-- wheel progress.
ALTER TABLE "CustomerLoyalty" RENAME TO "Customer";
ALTER TABLE "Customer" RENAME CONSTRAINT "CustomerLoyalty_pkey" TO "Customer_pkey";

ALTER TABLE "Customer" ADD COLUMN "name" TEXT;
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Every phone we have ever seen becomes a Customer row, so the foreign keys below
-- can never fail. Phones were normalized to 10 digits by an earlier migration.
INSERT INTO "Customer" ("phone", "spinBaseline", "wheelConsumed", "createdAt", "updatedAt", "firstSeenAt")
SELECT DISTINCT seen.phone, 0, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT "customerPhone" AS phone FROM "Order"
  UNION
  SELECT phone FROM "SpinUsage"
  UNION
  SELECT phone FROM "SpinReward"
) AS seen
WHERE seen.phone IS NOT NULL AND length(seen.phone) = 10
ON CONFLICT ("phone") DO NOTHING;

-- Identity details come from the customer's most recent order that actually had one.
UPDATE "Customer" c SET "name" = s."customerName"
FROM (
  SELECT DISTINCT ON ("customerPhone") "customerPhone" AS phone, "customerName"
  FROM "Order" WHERE "customerName" <> '' ORDER BY "customerPhone", "createdAt" DESC
) s WHERE c."phone" = s.phone;

UPDATE "Customer" c SET "email" = s."customerEmail"
FROM (
  SELECT DISTINCT ON ("customerPhone") "customerPhone" AS phone, "customerEmail"
  FROM "Order" WHERE "customerEmail" IS NOT NULL AND "customerEmail" <> ''
  ORDER BY "customerPhone", "createdAt" DESC
) s WHERE c."phone" = s.phone;

UPDATE "Customer" c SET "firstSeenAt" = s.first_at
FROM (SELECT "customerPhone" AS phone, min("createdAt") AS first_at FROM "Order" GROUP BY 1) s
WHERE c."phone" = s.phone;

-- Link orders to the spine.
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;
UPDATE "Order" SET "customerId" = "customerPhone" WHERE length("customerPhone") = 10;
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- Record which rule granted each spin. Every existing spin happened while the
-- "wheel for everyone" promo was on, so EVERYONE is the historically correct value.
CREATE TYPE "SpinMode" AS ENUM ('REGULARS', 'EVERYONE');
ALTER TABLE "SpinUsage" ADD COLUMN "mode" "SpinMode" NOT NULL DEFAULT 'EVERYONE';
ALTER TABLE "SpinUsage" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "SpinUsage" ADD CONSTRAINT "SpinUsage_phone_fkey"
  FOREIGN KEY ("phone") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link each reward to the order it was spent on, replacing the couponCode string join.
-- baselineBefore records the customer's spinBaseline prior to redemption so cancelling
-- the order can restore the exact previous cycle.
ALTER TABLE "SpinReward" ADD COLUMN "orderId" TEXT;
ALTER TABLE "SpinReward" ADD COLUMN "baselineBefore" INTEGER;
-- Only redeemed rewards point at an order, and a code can sit on both an abandoned
-- PENDING order and the paid one, so prefer the paid order and break ties by age.
UPDATE "SpinReward" r SET "orderId" = (
  SELECT o."id" FROM "Order" o
  WHERE o."couponCode" = r."couponCode"
  ORDER BY (o."paymentStatus" IN ('PAID_ONLINE', 'PAID_MANUALLY')) DESC, o."createdAt" ASC
  LIMIT 1
)
WHERE r."redeemedAt" IS NOT NULL;
CREATE INDEX "SpinReward_orderId_idx" ON "SpinReward"("orderId");
ALTER TABLE "SpinReward" ADD CONSTRAINT "SpinReward_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpinReward" ADD CONSTRAINT "SpinReward_phone_fkey"
  FOREIGN KEY ("phone") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;
