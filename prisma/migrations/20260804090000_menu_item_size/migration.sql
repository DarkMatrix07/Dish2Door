-- Pizza menus price one dish per size, so a dish is several rows sharing a name within
-- a course. Null sizeLabel means the dish has no size options (the existing behaviour).
ALTER TABLE "MenuItem" ADD COLUMN "sizeLabel" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "sizeOrder" INTEGER NOT NULL DEFAULT 0;
