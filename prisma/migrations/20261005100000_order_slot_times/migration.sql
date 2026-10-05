-- Owner-editable delivery slot times (minutes after midnight, India time).
-- Defaults match the previously hard-coded slots, so nothing changes until they are edited.
ALTER TABLE "SystemSettings" ADD COLUMN "afternoonCutoffMinute" INTEGER NOT NULL DEFAULT 720;
ALTER TABLE "SystemSettings" ADD COLUMN "afternoonDeliveryMinute" INTEGER NOT NULL DEFAULT 820;
ALTER TABLE "SystemSettings" ADD COLUMN "nightCutoffMinute" INTEGER NOT NULL DEFAULT 1065;
ALTER TABLE "SystemSettings" ADD COLUMN "nightDeliveryMinute" INTEGER NOT NULL DEFAULT 1170;
