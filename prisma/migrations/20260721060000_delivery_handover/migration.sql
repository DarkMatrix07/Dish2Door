-- Handover details captured when the delivery person confirms a drop-off, so there is
-- a record of who actually received the order if it is later disputed.
ALTER TABLE "Order" ADD COLUMN "receivedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryNote" TEXT;
