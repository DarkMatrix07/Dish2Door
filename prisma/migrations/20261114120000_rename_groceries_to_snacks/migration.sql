-- The WhatsApp shop at slug "groceries" is the snacks counter (momos, starters,
-- fried chicken, pasta). Routes and the slug stay. Only the customer-facing
-- name and the original grocery description change, and only while they are
-- still the values this shop was created with.
UPDATE "Restaurant"
SET
  "name" = 'Snacks',
  "description" = CASE
    WHEN "description" = 'Everyday groceries delivered on campus. Order over WhatsApp — pay on handover.'
    THEN 'Momos, veg and non-veg starters, fried chicken, and pasta. Order over WhatsApp — pay on handover.'
    ELSE "description"
  END,
  "updatedAt" = now()
WHERE "slug" = 'groceries'
  AND "name" = 'Groceries';
