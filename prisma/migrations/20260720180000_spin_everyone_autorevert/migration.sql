-- IST day whose ordering-window close ends the everyone-mode promo. A background job
-- reverts to regulars-only once this day's close passes.
ALTER TABLE "SystemSettings" ADD COLUMN "spinWheelEveryoneUntilDay" TEXT;

-- The promo is on right now. Stamp it so the revert job has an end day: today if the
-- ordering window is still open, otherwise tomorrow (enabling after close should still
-- give a full day rather than reverting the instant this deploys).
UPDATE "SystemSettings"
SET "spinWheelEveryoneUntilDay" = to_char(
  CURRENT_TIMESTAMP + interval '5 hours 30 minutes'
    + CASE
        WHEN (EXTRACT(HOUR FROM CURRENT_TIMESTAMP + interval '5 hours 30 minutes') * 60
              + EXTRACT(MINUTE FROM CURRENT_TIMESTAMP + interval '5 hours 30 minutes'))
             < "orderingCloseMinute"
        THEN interval '0 day'
        ELSE interval '1 day'
      END,
  'YYYY-MM-DD')
WHERE "spinWheelForEveryone" = true AND "spinWheelEveryoneUntilDay" IS NULL;
