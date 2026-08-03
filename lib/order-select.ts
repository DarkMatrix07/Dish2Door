export const orderInclude = {
  restaurant: true,
  session: true,
  items: true,
  rating: true,
  // Which campus the order was placed for. Admin views and the kitchen PDF split by
  // campus, since the two campuses are prepared and delivered separately.
  campus: { select: { id: true, code: true, name: true } },
  deliveredBy: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  }
} as const;
