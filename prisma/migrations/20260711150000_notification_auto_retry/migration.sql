ALTER TABLE "NotificationLog"
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextRetryAt" TIMESTAMP(3),
ADD COLUMN "lastRetryAt" TIMESTAMP(3),
ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "NotificationLog_status_nextRetryAt_idx"
ON "NotificationLog"("status", "nextRetryAt");

UPDATE "NotificationLog"
SET "nextRetryAt" = "sentAt" + INTERVAL '10 minutes'
WHERE "status" = 'FAILED'
  AND "channel" IN ('EMAIL', 'WHATSAPP');
