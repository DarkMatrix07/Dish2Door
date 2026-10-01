-- Admin-given wheel prizes: who gave it and an optional note.
ALTER TABLE "SpinReward" ADD COLUMN "issuedById" TEXT;
ALTER TABLE "SpinReward" ADD COLUMN "issuedNote" TEXT;

ALTER TABLE "SpinReward" ADD CONSTRAINT "SpinReward_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
