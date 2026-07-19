-- AlterTable: daily ordering window (minutes from IST midnight)
ALTER TABLE "SystemSettings" ADD COLUMN "orderingOpenMinute" INTEGER NOT NULL DEFAULT 360;
ALTER TABLE "SystemSettings" ADD COLUMN "orderingCloseMinute" INTEGER NOT NULL DEFAULT 1380;
