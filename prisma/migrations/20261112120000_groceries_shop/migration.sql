-- Groceries is a second WhatsApp shop, set up the same way as Domino's: its own
-- restaurant row, confirmed by hand, pay on handover. Courses, items and combos are
-- added in /admin/groceries. VIT-AP only until the shop is opened up from that page.
INSERT INTO "Restaurant" ("id","name","slug","description","active","orderMode","acceptingOrders","restrictedToCampusCode","createdAt","updatedAt")
VALUES (
  'shop_groceries',
  'Groceries',
  'groceries',
  'Everyday groceries delivered on campus. Order over WhatsApp — pay on handover.',
  true,
  'WHATSAPP',
  true,
  'VIT_AP',
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;
