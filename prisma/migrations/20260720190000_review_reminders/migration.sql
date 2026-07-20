-- Follow-up emails chasing a rating on a delivered order. Reminder count per order is
-- read straight from NotificationLog, so no extra table is needed.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'REVIEW_REMINDER';
