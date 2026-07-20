-- Start the loyalty count from today. Every customer's spinBaseline is moved up to
-- their current reviewed-order total, so historical reviews (collected before the
-- wheel became a repeating loop) no longer count towards a spin. Wheel eligibility is
-- (reviewed orders - spinBaseline), so this puts everyone at 0 of 3 and only reviews
-- given from now on move them towards the 4th-order reward.
--
-- Real order history and ratings are untouched; only the wheel counter is rebased.
UPDATE "Customer" c
SET "spinBaseline" = COALESCE((
  SELECT count(*)
  FROM "Order" o
  JOIN "Rating" r ON r."orderId" = o."id"
  WHERE o."customerPhone" = c."phone"
), 0);
