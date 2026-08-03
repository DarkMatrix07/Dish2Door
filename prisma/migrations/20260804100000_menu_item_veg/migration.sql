-- Indian menus are expected to mark each dish veg or non-veg. Null means the kitchen
-- has not classified it, so nothing is claimed about food we do not have data for.
ALTER TABLE "MenuItem" ADD COLUMN "isVeg" BOOLEAN;
