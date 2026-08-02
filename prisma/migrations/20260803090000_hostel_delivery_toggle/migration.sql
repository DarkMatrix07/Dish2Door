-- Per-campus switch for hostel delivery. Defaults to true so the existing campus keeps
-- working exactly as before; a newly launched campus can start gate-only and turn this
-- on once it has delivery staff for the hostel blocks.
ALTER TABLE "SystemSettings" ADD COLUMN "hostelDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true;
