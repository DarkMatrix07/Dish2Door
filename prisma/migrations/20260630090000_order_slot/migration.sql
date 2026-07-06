-- CreateEnum
CREATE TYPE "OrderSlot" AS ENUM ('AFTERNOON', 'NIGHT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderSlot" "OrderSlot";
