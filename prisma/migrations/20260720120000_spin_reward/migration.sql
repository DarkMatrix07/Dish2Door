-- CreateTable
CREATE TABLE "SpinReward" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "discountPercent" INTEGER NOT NULL,
    "couponCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "SpinReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpinReward_phone_key" ON "SpinReward"("phone");

-- CreateIndex
CREATE INDEX "SpinReward_couponCode_idx" ON "SpinReward"("couponCode");
