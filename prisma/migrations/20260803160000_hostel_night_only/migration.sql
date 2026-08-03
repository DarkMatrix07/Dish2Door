-- Hostel runs are only worth doing on the night slot, so hostel delivery can be limited
-- to NIGHT orders while gate pickup stays available for both slots.
ALTER TABLE "Campus" ADD COLUMN "hostelDeliveryNightOnly" BOOLEAN NOT NULL DEFAULT false;

-- Both campuses operate that way today (SRM-AP has hostel delivery off entirely, so this
-- only takes effect there once it is switched on).
UPDATE "Campus" SET "hostelDeliveryNightOnly" = true;
