import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

const imageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Use a valid image URL");

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("restaurant.create"),
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    imageUrl: imageUrlSchema.optional()
  }),
  z.object({
    action: z.literal("restaurant.update"),
    id: z.string(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    imageUrl: imageUrlSchema.nullable().optional()
  }),
  z.object({
    action: z.literal("restaurant.delete"),
    id: z.string()
  }),
  z.object({
    action: z.literal("course.create"),
    restaurantId: z.string(),
    name: z.string().min(2),
    sortOrder: z.number().int().default(0)
  }),
  z.object({
    action: z.literal("course.update"),
    id: z.string(),
    name: z.string().min(2),
    sortOrder: z.number().int().optional()
  }),
  z.object({
    action: z.literal("course.delete"),
    id: z.string()
  }),
  z.object({
    action: z.literal("restaurant.active"),
    id: z.string(),
    active: z.boolean()
  }),
  z.object({
    action: z.literal("item.create"),
    restaurantId: z.string(),
    courseId: z.string(),
    name: z.string().min(2),
    description: z.string().optional(),
    pricePaise: z.number().int().min(100),
    discountPercent: z.number().int().min(0).max(90).default(0),
    imageUrl: imageUrlSchema.optional()
  }),
  z.object({
    action: z.literal("item.update"),
    id: z.string(),
    courseId: z.string().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    pricePaise: z.number().int().min(100).optional(),
    discountPercent: z.number().int().min(0).max(90).optional(),
    imageUrl: imageUrlSchema.nullable().optional()
  }),
  z.object({
    action: z.literal("coupon.create"),
    code: z.string().min(3).max(24),
    description: z.string().optional(),
    discountPercent: z.number().int().min(1).max(100),
    maxUses: z.number().int().min(1).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("coupon.update"),
    id: z.string(),
    code: z.string().min(3).max(24).optional(),
    description: z.string().nullable().optional(),
    discountPercent: z.number().int().min(1).max(100).optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("coupon.active"),
    id: z.string(),
    active: z.boolean()
  }),
  z.object({
    action: z.literal("coupon.delete"),
    id: z.string()
  }),
  z.object({
    action: z.literal("course.reorder"),
    restaurantId: z.string(),
    orderedIds: z.array(z.string()).min(1)
  }),
  z.object({
    action: z.literal("item.stock"),
    id: z.string(),
    available: z.boolean()
  }),
  z.object({
    action: z.literal("item.delete"),
    id: z.string()
  })
]);

export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [restaurants, coupons] = await Promise.all([
    prisma.restaurant.findMany({
      include: {
        courses: { orderBy: { sortOrder: "asc" } },
        menuItems: { include: { course: true }, orderBy: { name: "asc" } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 20 })
  ]);

  return NextResponse.json({ restaurants, coupons });
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
  const body = schema.parse(await request.json());

  if (body.action === "restaurant.create") {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        imageUrl: body.imageUrl
      }
    });
    return NextResponse.json({ restaurant });
  }

  if (body.action === "restaurant.update") {
    const restaurant = await prisma.restaurant.update({
      where: { id: body.id },
      data: {
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl
      }
    });
    return NextResponse.json({ restaurant });
  }

  if (body.action === "restaurant.delete") {
    const restaurant = await prisma.restaurant.delete({ where: { id: body.id } });
    return NextResponse.json({ restaurant });
  }

  if (body.action === "course.create") {
    const course = await prisma.course.create({
      data: {
        restaurantId: body.restaurantId,
        name: body.name,
        sortOrder: body.sortOrder
      }
    });
    return NextResponse.json({ course });
  }

  if (body.action === "course.update") {
    const course = await prisma.course.update({
      where: { id: body.id },
      data: {
        name: body.name,
        sortOrder: body.sortOrder
      }
    });
    return NextResponse.json({ course });
  }

  if (body.action === "course.delete") {
    const course = await prisma.course.delete({ where: { id: body.id } });
    return NextResponse.json({ course });
  }

  if (body.action === "restaurant.active") {
    const restaurant = await prisma.restaurant.update({
      where: { id: body.id },
      data: { active: body.active }
    });
    return NextResponse.json({ restaurant });
  }

  if (body.action === "item.create") {
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: body.restaurantId,
        courseId: body.courseId,
        name: body.name,
        description: body.description,
        pricePaise: body.pricePaise,
        discountPercent: body.discountPercent,
        imageUrl: body.imageUrl
      }
    });
    return NextResponse.json({ item });
  }

  if (body.action === "item.update") {
    const item = await prisma.menuItem.update({
      where: { id: body.id },
      data: {
        courseId: body.courseId,
        name: body.name,
        description: body.description,
        pricePaise: body.pricePaise,
        discountPercent: body.discountPercent,
        imageUrl: body.imageUrl
      }
    });
    return NextResponse.json({ item });
  }

  if (body.action === "coupon.create") {
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.toUpperCase(),
        description: body.description,
        discountPercent: body.discountPercent,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
      }
    });
    return NextResponse.json({ coupon });
  }

  if (body.action === "coupon.update") {
    const coupon = await prisma.coupon.update({
      where: { id: body.id },
      data: {
        code: body.code?.toUpperCase(),
        description: body.description,
        discountPercent: body.discountPercent,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : body.expiresAt
      }
    });
    return NextResponse.json({ coupon });
  }

  if (body.action === "coupon.active") {
    const coupon = await prisma.coupon.update({
      where: { id: body.id },
      data: { active: body.active }
    });
    return NextResponse.json({ coupon });
  }

  if (body.action === "coupon.delete") {
    const coupon = await prisma.coupon.delete({ where: { id: body.id } });
    return NextResponse.json({ coupon });
  }

  if (body.action === "course.reorder") {
    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.course.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === "item.stock") {
    const item = await prisma.menuItem.update({
      where: { id: body.id },
      data: { available: body.available }
    });
    return NextResponse.json({ item });
  }

  const item = await prisma.menuItem.delete({
    where: { id: body.id }
  });
  return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = issue?.path.join(".") || "input";
      return NextResponse.json({ error: issue ? `${field}: ${issue.message}` : "Invalid input" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Action failed";
    // Prisma unique-constraint (e.g. duplicate coupon code / restaurant slug)
    const friendly = message.includes("Unique constraint")
      ? "That value already exists (duplicate code or name)."
      : message;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
