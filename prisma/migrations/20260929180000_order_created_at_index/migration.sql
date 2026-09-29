-- Speeds up the orders screens, which all filter or sort by placement time.
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
