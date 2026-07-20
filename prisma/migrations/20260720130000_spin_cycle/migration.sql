-- CreateTable
CREATE TABLE "CustomerLoyalty" (
    "phone" TEXT NOT NULL,
    "spinBaseline" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoyalty_pkey" PRIMARY KEY ("phone")
);

-- Allow multiple (historical, redeemed) spins per phone, but only ONE outstanding
-- (unredeemed) spin at a time. Replaces the old one-spin-per-phone-forever rule.
DROP INDEX IF EXISTS "SpinReward_phone_key";
CREATE INDEX "SpinReward_phone_idx" ON "SpinReward"("phone");
CREATE UNIQUE INDEX "SpinReward_phone_outstanding_key" ON "SpinReward"("phone") WHERE "redeemedAt" IS NULL;
