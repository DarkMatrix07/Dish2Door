export const orderInclude = {
  restaurant: true,
  session: true,
  items: true,
  rating: true,
  deliveredBy: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  }
} as const;
