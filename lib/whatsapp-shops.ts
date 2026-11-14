// The WhatsApp shops. Each one is a Restaurant row with orderMode WHATSAPP, its own
// customer page, and its own admin section. The order pipeline is shared; these
// constants are how the pages, the nav and the reports tell the shops apart.

export const DOMINOS_SLUG = "dominos-pizza";
export const GROCERIES_SLUG = "groceries";

// Fixed ids from the migrations, so an activity-log row can link to the right admin
// section without a database lookup.
export const DOMINOS_SHOP_ID = "shop_dominos_pizza";
export const GROCERIES_SHOP_ID = "shop_groceries";

export const SHOP_ADMIN_LINKS: Record<string, { href: string; label: string }> = {
  [DOMINOS_SHOP_ID]: { href: "/admin/pizza", label: "Open Domino's shop" },
  [GROCERIES_SHOP_ID]: { href: "/admin/groceries", label: "Open Snacks" }
};
