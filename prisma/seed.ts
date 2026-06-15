import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/db";

async function main() {
  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ordersOpen: true,
      closedMessage: "Orders are closed for today. Please contact the admin for urgent orders.",
      contactNumber: "Add contact number",
      platformFeePaise: 200,
      hostelDeliveryFeePaise: 1500,
      paymentChargePercentBps: 250,
      paymentChargeFixedPaise: 0
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@campus.local" },
    update: {},
    create: {
      name: "Campus Admin",
      email: "admin@campus.local",
      role: "ADMIN",
      passwordHash: await hashPassword("admin123")
    }
  });

  await prisma.user.upsert({
    where: { email: "delivery@campus.local" },
    update: {},
    create: {
      name: "Delivery Lead",
      email: "delivery@campus.local",
      phone: "9999999999",
      role: "DELIVERY",
      passwordHash: await hashPassword("delivery123")
    }
  });

  const restaurants = [
    {
      name: "Campus Kitchen",
      slug: "campus-kitchen",
      description: "Fast campus comfort food for gate pickup and hostel delivery.",
      imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85",
      courses: ["Mains", "Snacks", "Drinks"],
      items: [
        {
          name: "Paneer Tikka Wrap",
          description: "Smoky paneer, crunchy onions, mint mayo, soft rumali wrap.",
          pricePaise: 14900,
          discountPercent: 10,
          courseName: "Mains",
          imageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Campus Biryani Bowl",
          description: "Layered rice, masala, raita, and crisp onions.",
          pricePaise: 19900,
          discountPercent: 0,
          courseName: "Mains",
          imageUrl: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Masala Fries",
          description: "Crispy fries tossed with house spice and dip.",
          pricePaise: 8900,
          discountPercent: 0,
          courseName: "Snacks",
          imageUrl: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Sweet Lassi",
          description: "Cold, creamy, and perfect after class.",
          pricePaise: 6900,
          discountPercent: 0,
          courseName: "Drinks",
          imageUrl: "https://images.unsplash.com/photo-1627308595229-7830a5c91f9f?auto=format&fit=crop&w=900&q=85"
        }
      ]
    },
    {
      name: "Pizza Corner",
      slug: "pizza-corner",
      description: "Hot slices, garlic bread, and quick party food for late study sessions.",
      imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=85",
      courses: ["Pizzas", "Sides", "Drinks"],
      items: [
        {
          name: "Margherita Pizza",
          description: "Cheese, basil, tomato sauce, and a crisp campus-style crust.",
          pricePaise: 22900,
          discountPercent: 15,
          courseName: "Pizzas",
          imageUrl: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Cheese Garlic Bread",
          description: "Toasted bread with garlic butter and melted cheese.",
          pricePaise: 11900,
          discountPercent: 0,
          courseName: "Sides",
          imageUrl: "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Lemon Iced Tea",
          description: "Cold lemon tea for pizza nights and group orders.",
          pricePaise: 7900,
          discountPercent: 0,
          courseName: "Drinks",
          imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85"
        }
      ]
    },
    {
      name: "Bowl House",
      slug: "bowl-house",
      description: "Rice bowls, rolls, and protein-packed meals that travel well to hostels.",
      imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
      courses: ["Rice Bowls", "Rolls", "Desserts"],
      items: [
        {
          name: "Teriyaki Paneer Bowl",
          description: "Paneer, rice, greens, sesame, and sweet-savory sauce.",
          pricePaise: 18900,
          discountPercent: 0,
          courseName: "Rice Bowls",
          imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Double Egg Roll",
          description: "Classic campus roll with egg, onions, sauces, and a flaky wrap.",
          pricePaise: 12900,
          discountPercent: 5,
          courseName: "Rolls",
          imageUrl: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Chocolate Brownie",
          description: "Dense chocolate brownie packed safely for delivery.",
          pricePaise: 9900,
          discountPercent: 0,
          courseName: "Desserts",
          imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85"
        }
      ]
    }
  ];

  for (const restaurantSeed of restaurants) {
    const restaurant = await prisma.restaurant.upsert({
      where: { slug: restaurantSeed.slug },
      update: {
        name: restaurantSeed.name,
        description: restaurantSeed.description,
        imageUrl: restaurantSeed.imageUrl,
        active: true
      },
      create: {
        name: restaurantSeed.name,
        slug: restaurantSeed.slug,
        description: restaurantSeed.description,
        imageUrl: restaurantSeed.imageUrl
      }
    });

    const courseMap = new Map<string, string>();
    for (const [index, courseName] of restaurantSeed.courses.entries()) {
      const course = await prisma.course.upsert({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: courseName } },
        update: { sortOrder: index + 1 },
        create: { restaurantId: restaurant.id, name: courseName, sortOrder: index + 1 }
      });
      courseMap.set(courseName, course.id);
    }

    for (const item of restaurantSeed.items) {
      const existing = await prisma.menuItem.findFirst({
        where: { restaurantId: restaurant.id, name: item.name }
      });
      const courseId = courseMap.get(item.courseName);
      if (!courseId) throw new Error(`Missing course ${item.courseName}`);

      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            description: item.description,
            pricePaise: item.pricePaise,
            discountPercent: item.discountPercent,
            imageUrl: item.imageUrl,
            courseId,
            available: true
          }
        });
      } else {
        await prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            courseId,
            name: item.name,
            description: item.description,
            pricePaise: item.pricePaise,
            discountPercent: item.discountPercent,
            imageUrl: item.imageUrl
          }
        });
      }
    }
  }

  await prisma.coupon.upsert({
    where: { code: "HOSTEL10" },
    update: {},
    create: {
      code: "HOSTEL10",
      description: "Demo hostel order coupon",
      discountPercent: 10,
      active: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
