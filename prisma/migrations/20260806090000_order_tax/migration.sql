-- GST charged on an order, stored as its own line rather than folded into a fee so
-- the bill can show it and past orders (which carried no tax) stay at 0.
ALTER TABLE "Order" ADD COLUMN "taxPaise" INTEGER NOT NULL DEFAULT 0;
