-- Admin toggle: offer the discount wheel to every customer, regardless of order count.
ALTER TABLE "SystemSettings" ADD COLUMN "spinWheelForEveryone" BOOLEAN NOT NULL DEFAULT false;

-- Per-phone flag: the customer has taken or forfeited their spin for the current cycle.
ALTER TABLE "CustomerLoyalty" ADD COLUMN "wheelConsumed" BOOLEAN NOT NULL DEFAULT false;
