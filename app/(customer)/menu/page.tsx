import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { MenuClient } from "@/components/customer/MenuClient";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const fallbackRestaurants = [
  {
    id: "demo-restaurant",
    name: "Campus Kitchen",
    description: "Fast campus comfort food for gate pickup and hostel delivery.",
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85",
    courses: [
      { id: "demo-main", name: "Mains" },
      { id: "demo-snacks", name: "Snacks" },
      { id: "demo-drinks", name: "Drinks" }
    ],
    menuItems: [
      {
        id: "demo-paneer-wrap",
        name: "Paneer Tikka Wrap",
        description: "Smoky paneer, crunchy onions, mint mayo, soft rumali wrap.",
        pricePaise: 14900,
        discountPercent: 10,
        imageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "demo-main"
      },
      {
        id: "demo-biryani",
        name: "Campus Biryani Bowl",
        description: "Layered rice, masala, raita, and crisp onions.",
        pricePaise: 19900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "demo-main"
      },
      {
        id: "demo-fries",
        name: "Masala Fries",
        description: "Crispy fries tossed with house spice and dip.",
        pricePaise: 8900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "demo-snacks"
      },
      {
        id: "demo-lassi",
        name: "Sweet Lassi",
        description: "Cold, creamy, and perfect after class.",
        pricePaise: 6900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1627308595229-7830a5c91f9f?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "demo-drinks"
      }
    ]
  },
  {
    id: "demo-pizza-corner",
    name: "Pizza Corner",
    description: "Hot slices, garlic bread, and quick party food for late study sessions.",
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=85",
    courses: [
      { id: "pizza-pizzas", name: "Pizzas" },
      { id: "pizza-sides", name: "Sides" },
      { id: "pizza-drinks", name: "Drinks" }
    ],
    menuItems: [
      {
        id: "demo-margherita",
        name: "Margherita Pizza",
        description: "Cheese, basil, tomato sauce, and a crisp campus-style crust.",
        pricePaise: 22900,
        discountPercent: 15,
        imageUrl: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "pizza-pizzas"
      },
      {
        id: "demo-garlic-bread",
        name: "Cheese Garlic Bread",
        description: "Toasted bread with garlic butter and melted cheese.",
        pricePaise: 11900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "pizza-sides"
      },
      {
        id: "demo-iced-tea",
        name: "Lemon Iced Tea",
        description: "Cold lemon tea for pizza nights and group orders.",
        pricePaise: 7900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "pizza-drinks"
      }
    ]
  },
  {
    id: "demo-bowl-house",
    name: "Bowl House",
    description: "Rice bowls, rolls, and protein-packed meals that travel well to hostels.",
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
    courses: [
      { id: "bowl-rice", name: "Rice Bowls" },
      { id: "bowl-rolls", name: "Rolls" },
      { id: "bowl-desserts", name: "Desserts" }
    ],
    menuItems: [
      {
        id: "demo-teriyaki-bowl",
        name: "Teriyaki Paneer Bowl",
        description: "Paneer, rice, greens, sesame, and sweet-savory sauce.",
        pricePaise: 18900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "bowl-rice"
      },
      {
        id: "demo-egg-roll",
        name: "Double Egg Roll",
        description: "Classic campus roll with egg, onions, sauces, and a flaky wrap.",
        pricePaise: 12900,
        discountPercent: 5,
        imageUrl: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "bowl-rolls"
      },
      {
        id: "demo-brownie",
        name: "Chocolate Brownie",
        description: "Dense chocolate brownie packed safely for delivery.",
        pricePaise: 9900,
        discountPercent: 0,
        imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85",
        available: true,
        courseId: "bowl-desserts"
      }
    ]
  }
];

async function getMenuData() {
  try {
    const [settings, restaurants] = await Promise.all([
      getSettings(),
      prisma.restaurant.findMany({
        where: { active: true },
        include: {
          courses: { orderBy: { sortOrder: "asc" } },
          menuItems: { orderBy: { name: "asc" } }
        },
        orderBy: { name: "asc" }
      })
    ]);

    return { settings, restaurants: restaurants.length ? restaurants : fallbackRestaurants };
  } catch {
    return {
      settings: {
        ordersOpen: true,
        closedMessage: "Orders are closed for today.",
        contactNumber: "Admin"
      },
      restaurants: fallbackRestaurants
    };
  }
}

export default async function MenuPage() {
  const { settings, restaurants } = await getMenuData();

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <MenuClient restaurants={restaurants} />;
}
