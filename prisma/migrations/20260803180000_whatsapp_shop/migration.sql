-- A shop can take orders through Razorpay (as today) or hand the order off to WhatsApp,
-- where it is confirmed by hand. New enum values must be added before they are used.
ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'CUSTOMER_WHATSAPP';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRMATION';

CREATE TYPE "RestaurantOrderMode" AS ENUM ('ONLINE_PAYMENT', 'WHATSAPP');

ALTER TABLE "Restaurant" ADD COLUMN "orderMode" "RestaurantOrderMode" NOT NULL DEFAULT 'ONLINE_PAYMENT';
-- Distinct from `active`: a shop stays listed but can pause orders (open/close switch).
ALTER TABLE "Restaurant" ADD COLUMN "acceptingOrders" BOOLEAN NOT NULL DEFAULT true;
-- Null means available at every campus; a Campus.code limits the shop to that campus.
ALTER TABLE "Restaurant" ADD COLUMN "restrictedToCampusCode" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "whatsappNumber" TEXT;

-- The first WhatsApp shop. Courses, items and combos are added by the admin; this row
-- just needs to exist so those pages have something to attach to. VIT-AP only for now.
INSERT INTO "Restaurant" ("id","name","slug","description","active","orderMode","acceptingOrders","restrictedToCampusCode","createdAt","updatedAt")
VALUES (
  'shop_dominos_pizza',
  'Domino''s Pizza',
  'dominos-pizza',
  'Hot pizzas, sides and combos delivered on campus. Order over WhatsApp — pay on handover.',
  true,
  'WHATSAPP',
  true,
  'VIT_AP',
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;
