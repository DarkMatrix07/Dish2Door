-- Normalize SpinUsage.outcome from free text to a constrained enum, so a typo in
-- application code can no longer silently store an unrecognised outcome.
CREATE TYPE "SpinOutcome" AS ENUM ('SPUN', 'FORFEITED');

ALTER TABLE "SpinUsage"
  ALTER COLUMN "outcome" TYPE "SpinOutcome" USING "outcome"::"SpinOutcome";
