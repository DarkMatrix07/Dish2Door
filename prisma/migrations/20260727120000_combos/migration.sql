-- Fixed-price bundles ("combos") of menu items from a single restaurant. The admin
-- sets comboPricePaise directly; at checkout a combo becomes one order line at that
-- price. ComboItem lists what's inside (menu items + quantity) for display/kitchen.
CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "comboPricePaise" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboItem" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Combo_restaurantId_idx" ON "Combo"("restaurantId");
CREATE INDEX "ComboItem_comboId_idx" ON "ComboItem"("comboId");
CREATE INDEX "ComboItem_menuItemId_idx" ON "ComboItem"("menuItemId");
CREATE UNIQUE INDEX "ComboItem_comboId_menuItemId_key" ON "ComboItem"("comboId", "menuItemId");

ALTER TABLE "Combo" ADD CONSTRAINT "Combo_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
