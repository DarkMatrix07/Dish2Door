-- Campuses. Restaurants stay shared; a campus only carries its own commercials and
-- whether hostel delivery runs there.
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "platformFeePaise" INTEGER NOT NULL,
    "hostelDeliveryFeePaise" INTEGER NOT NULL,
    "hostelDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentChargePercentBps" INTEGER NOT NULL,
    "paymentChargeFixedPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Campus_code_key" ON "Campus"("code");

-- VIT-AP inherits the fees that are live today, so nothing changes for it.
INSERT INTO "Campus" ("id","code","name","sortOrder","platformFeePaise","hostelDeliveryFeePaise","hostelDeliveryEnabled","paymentChargePercentBps","paymentChargeFixedPaise")
SELECT 'campus_vit_ap','VIT_AP','VIT-AP',0,
       COALESCE((SELECT "platformFeePaise"        FROM "SystemSettings" WHERE id='default'), 200),
       COALESCE((SELECT "hostelDeliveryFeePaise"  FROM "SystemSettings" WHERE id='default'), 1500),
       true,
       COALESCE((SELECT "paymentChargePercentBps" FROM "SystemSettings" WHERE id='default'), 250),
       COALESCE((SELECT "paymentChargeFixedPaise" FROM "SystemSettings" WHERE id='default'), 0);

-- SRM-AP launches gate-pickup only, with a higher platform fee and payment handling.
INSERT INTO "Campus" ("id","code","name","sortOrder","platformFeePaise","hostelDeliveryFeePaise","hostelDeliveryEnabled","paymentChargePercentBps","paymentChargeFixedPaise")
VALUES ('campus_srm_ap','SRM_AP','SRM-AP',1,1000,
        COALESCE((SELECT "hostelDeliveryFeePaise" FROM "SystemSettings" WHERE id='default'), 1500),
        false, 300, 0);

-- Every existing order belongs to VIT-AP.
ALTER TABLE "Order" ADD COLUMN "campusId" TEXT;
UPDATE "Order" SET "campusId" = 'campus_vit_ap' WHERE "campusId" IS NULL;
CREATE INDEX "Order_campusId_idx" ON "Order"("campusId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hostel availability now lives per campus (added earlier today as a global flag).
ALTER TABLE "SystemSettings" DROP COLUMN IF EXISTS "hostelDeliveryEnabled";
