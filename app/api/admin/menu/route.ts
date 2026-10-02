import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeChanges, plural, recordAudit, rupees, shortList, summariseChanges, type AuditAction } from "@/lib/audit";
import {
  DOMINOS_MANAGED_MESSAGE,
  DOMINOS_MODE,
  MAIN_STORE_MODE,
  MAX_BULK_ITEMS,
  MAX_DISCOUNT_PERCENT,
  isPlausibleId,
  menuTargetOf,
  restaurantDeleteBlock
} from "@/lib/menu-admin";

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
    discountPercent: z.number().int().min(0).max(MAX_DISCOUNT_PERCENT).default(0),
    imageUrl: imageUrlSchema.optional(),
    sizeLabel: z.string().trim().max(24).nullable().optional(),
    sizeOrder: z.number().int().default(0),
    isVeg: z.boolean().nullable().optional()
  }),
  z.object({
    action: z.literal("item.update"),
    id: z.string(),
    courseId: z.string().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    pricePaise: z.number().int().min(100).optional(),
    discountPercent: z.number().int().min(0).max(MAX_DISCOUNT_PERCENT).optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    sizeLabel: z.string().trim().max(24).nullable().optional(),
    sizeOrder: z.number().int().optional(),
    isVeg: z.boolean().nullable().optional()
  }),
  // One discount for many items at once (0 removes it). Main-store items only.
  z.object({
    action: z.literal("item.discount"),
    ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_ITEMS),
    discountPercent: z.number().int().min(0).max(MAX_DISCOUNT_PERCENT)
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
  }),
  z.object({
    action: z.literal("combo.create"),
    restaurantId: z.string(),
    name: z.string().min(2).max(80),
    description: z.string().max(300).optional(),
    imageUrl: imageUrlSchema.optional(),
    comboPricePaise: z.number().int().min(100),
    items: z
      .array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1) }))
      .min(2, "A combo needs at least two items")
  }),
  z.object({
    action: z.literal("combo.update"),
    id: z.string(),
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(300).nullable().optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    comboPricePaise: z.number().int().min(100).optional(),
    items: z
      .array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1) }))
      .min(2, "A combo needs at least two items")
      .optional()
  }),
  z.object({
    action: z.literal("combo.active"),
    id: z.string(),
    active: z.boolean()
  }),
  z.object({
    action: z.literal("combo.delete"),
    id: z.string()
  })
]);

const comboInclude = { items: { include: { menuItem: true } } } as const;

// Guards that every menu item in a combo really belongs to the combo's restaurant, so
// a combo can never mix kitchens (checkout enforces this too, but fail early & clearly).
async function assertItemsBelongToRestaurant(restaurantId: string, menuItemIds: string[]) {
  const count = await prisma.menuItem.count({ where: { id: { in: menuItemIds }, restaurantId } });
  if (count !== new Set(menuItemIds).size) {
    throw new Error("Every combo item must belong to the selected restaurant.");
  }
}

// The Domino's menu is edited from /admin/pizza. Callers that only ever deal with the
// main store (the Restaurants, Items and Combos screens) send ?scope=main, and then every
// mutation that targets a WhatsApp-mode restaurant, or one of its courses, items or
// combos, is refused. It is opt-in because the Domino's admin screens also post here.
const itemInclude = { course: true } as const;

async function orderModeOfTarget(target: NonNullable<ReturnType<typeof menuTargetOf>>): Promise<string | null> {
  if (target.kind === "restaurant") {
    return (await prisma.restaurant.findUnique({ where: { id: target.id }, select: { orderMode: true } }))?.orderMode ?? null;
  }
  const select = { restaurant: { select: { orderMode: true } } } as const;
  if (target.kind === "course") return (await prisma.course.findUnique({ where: { id: target.id }, select }))?.restaurant.orderMode ?? null;
  if (target.kind === "item") return (await prisma.menuItem.findUnique({ where: { id: target.id }, select }))?.restaurant.orderMode ?? null;
  return (await prisma.combo.findUnique({ where: { id: target.id }, select }))?.restaurant.orderMode ?? null;
}

async function assertMainStoreTarget(body: { action: string } & Record<string, unknown>) {
  const target = menuTargetOf(body);
  if (!target) return;
  const orderMode = await orderModeOfTarget(target);
  if (orderMode === null) throw new Error("That record was already removed. Refresh and try again.");
  if (orderMode !== MAIN_STORE_MODE) throw new Error(DOMINOS_MANAGED_MESSAGE);
}

// A course from another restaurant would file the item under the wrong menu.
async function assertCourseBelongsToRestaurant(courseId: string, restaurantId: string) {
  const count = await prisma.course.count({ where: { id: courseId, restaurantId } });
  if (count !== 1) throw new Error("That course belongs to a different restaurant.");
}

// ---- Activity log ----
// Every successful change below adds one row to the admin activity log (lib/audit.ts). The
// "before" values are read just ahead of the write and are best effort: if a read fails the
// change itself still goes ahead, and the log row simply says less.
//
// A restaurant's rows point at its menu page. A Domino's shop has its own admin section,
// so its rows are filed under "shop" and point there instead.
type AuditSubject = { type: "restaurant" | "shop"; id: string | null; name: string };

const subjectOf = (restaurant: { id: string; name: string; orderMode: string }): AuditSubject => ({
  type: restaurant.orderMode === DOMINOS_MODE ? "shop" : "restaurant",
  id: restaurant.id,
  name: restaurant.name
});

async function restaurantSubject(restaurantId: string): Promise<AuditSubject> {
  const found = await prisma.restaurant
    .findUnique({ where: { id: restaurantId }, select: { id: true, name: true, orderMode: true } })
    .catch(() => null);
  return found ? subjectOf(found) : { type: "restaurant", id: restaurantId, name: "A restaurant" };
}

async function itemBefore(itemId: string) {
  return prisma.menuItem
    .findUnique({
      where: { id: itemId },
      select: {
        name: true,
        description: true,
        imageUrl: true,
        pricePaise: true,
        discountPercent: true,
        available: true,
        sizeLabel: true,
        courseId: true,
        restaurant: { select: { id: true, name: true, orderMode: true } }
      }
    })
    .catch(() => null);
}

function logMenu(actorId: string, action: AuditAction, subject: AuditSubject, detail: string, outcome: "ok" | "refused" = "ok") {
  return recordAudit({ actorId, action, targetType: subject.type, targetId: subject.id, outcome, detail });
}

const ITEM_CHANGES = [
  { key: "name", label: "name", kind: "text" },
  { key: "pricePaise", label: "price", kind: "money" },
  { key: "discountPercent", label: "discount", kind: "percent" },
  { key: "description", label: "description", kind: "changed" },
  { key: "imageUrl", label: "photo", kind: "changed" },
  { key: "sizeLabel", label: "size", kind: "text", empty: "no size" },
  { key: "courseId", label: "course", kind: "changed" }
] as const;

export async function GET(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?restaurantId=<id>: one main-store restaurant with its courses and items, so a screen
  // never has to download the whole catalogue.
  const restaurantId = new URL(request.url).searchParams.get("restaurantId");
  if (restaurantId !== null) {
    if (!isPlausibleId(restaurantId)) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        courses: { orderBy: { sortOrder: "asc" } },
        menuItems: { include: { course: true }, orderBy: { name: "asc" } }
      }
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    if (restaurant.orderMode !== MAIN_STORE_MODE) return NextResponse.json({ error: DOMINOS_MANAGED_MESSAGE }, { status: 403 });
    return NextResponse.json({ restaurant });
  }

  // No parameter: the full catalogue plus coupons, exactly as before, for the Domino's
  // screens that still read it.
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
  if (new URL(request.url).searchParams.get("scope") === "main") await assertMainStoreTarget(body);

  if (body.action === "restaurant.create") {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        imageUrl: body.imageUrl
      }
    });
    await logMenu(user.id, "menu.restaurant.create", subjectOf(restaurant), `Added restaurant "${restaurant.name}"`);
    return NextResponse.json({ restaurant });
  }

  if (body.action === "restaurant.update") {
    const before = await prisma.restaurant
      .findUnique({ where: { id: body.id }, select: { name: true, description: true, imageUrl: true } })
      .catch(() => null);
    const restaurant = await prisma.restaurant.update({
      where: { id: body.id },
      data: {
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl
      }
    });
    const changes = describeChanges(before, restaurant, [
      { key: "name", label: "name", kind: "text" },
      { key: "description", label: "description", kind: "changed" },
      { key: "imageUrl", label: "photo", kind: "changed" }
    ]);
    const detail = summariseChanges(before?.name ?? restaurant.name, changes);
    if (detail) await logMenu(user.id, "menu.restaurant.update", subjectOf(restaurant), detail);
    return NextResponse.json({ restaurant });
  }

  if (body.action === "restaurant.delete") {
    // Order.restaurantId is Restrict, and deleting a restaurant's orders would destroy
    // its history (and the revenue numbers built on it), so only a restaurant that has
    // never taken an order can be deleted. Its courses, items and combos cascade.
    const orderCount = await prisma.order.count({ where: { restaurantId: body.id } });
    const block = restaurantDeleteBlock(orderCount);
    const subject = await restaurantSubject(body.id);
    if (block) {
      await logMenu(user.id, "menu.restaurant.delete", subject, `Refused to delete "${subject.name}": ${block}`, "refused");
      throw new Error(block);
    }
    const restaurant = await prisma.restaurant.delete({ where: { id: body.id } });
    await logMenu(user.id, "menu.restaurant.delete", subject, `Deleted restaurant "${restaurant.name}" (it had never taken an order)`);
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
    const subject = await restaurantSubject(course.restaurantId);
    await logMenu(user.id, "menu.course.create", subject, `${subject.name}: added course "${course.name}"`);
    return NextResponse.json({ course });
  }

  if (body.action === "course.update") {
    const before = await prisma.course.findUnique({ where: { id: body.id }, select: { name: true } }).catch(() => null);
    const course = await prisma.course.update({
      where: { id: body.id },
      data: {
        name: body.name,
        sortOrder: body.sortOrder
      }
    });
    // A reorder-only save (same name) is not worth a row.
    if (!before || before.name !== course.name) {
      const subject = await restaurantSubject(course.restaurantId);
      await logMenu(user.id, "menu.course.update", subject, `${subject.name}: course ${before ? `"${before.name}" → ` : "renamed to "}"${course.name}"`);
    }
    return NextResponse.json({ course });
  }

  if (body.action === "course.delete") {
    const course = await prisma.course.delete({ where: { id: body.id } });
    const subject = await restaurantSubject(course.restaurantId);
    await logMenu(user.id, "menu.course.delete", subject, `${subject.name}: deleted course "${course.name}"`);
    return NextResponse.json({ course });
  }

  if (body.action === "restaurant.active") {
    const restaurant = await prisma.restaurant.update({
      where: { id: body.id },
      data: { active: body.active }
    });
    await logMenu(user.id, "menu.restaurant.active", subjectOf(restaurant), `${restaurant.name}: switched ${restaurant.active ? "on" : "off"}`);
    return NextResponse.json({ restaurant });
  }

  if (body.action === "item.create") {
    await assertCourseBelongsToRestaurant(body.courseId, body.restaurantId);
    const item = await prisma.menuItem.create({
      include: itemInclude,
      data: {
        restaurantId: body.restaurantId,
        courseId: body.courseId,
        name: body.name,
        description: body.description,
        pricePaise: body.pricePaise,
        discountPercent: body.discountPercent,
        imageUrl: body.imageUrl,
        // Blank text from the form means "no size" — store null, not "".
        sizeLabel: body.sizeLabel?.trim() || null,
        sizeOrder: body.sizeOrder
      }
    });
    const subject = await restaurantSubject(item.restaurantId);
    await logMenu(user.id, "menu.item.create", subject, `${subject.name}: added "${item.name}" at ${rupees(item.pricePaise)}`);
    return NextResponse.json({ item });
  }

  if (body.action === "item.update") {
    if (body.courseId) {
      const existing = await prisma.menuItem.findUnique({ where: { id: body.id }, select: { restaurantId: true } });
      if (!existing) throw new Error("That item was already removed. Refresh and try again.");
      await assertCourseBelongsToRestaurant(body.courseId, existing.restaurantId);
    }
    const before = await itemBefore(body.id);
    const item = await prisma.menuItem.update({
      where: { id: body.id },
      include: itemInclude,
      data: {
        courseId: body.courseId,
        name: body.name,
        description: body.description,
        pricePaise: body.pricePaise,
        discountPercent: body.discountPercent,
        imageUrl: body.imageUrl,
        sizeLabel: body.sizeLabel === undefined ? undefined : body.sizeLabel?.trim() || null,
        sizeOrder: body.sizeOrder
      }
    });
    // One row per save. The most important thing that moved names the row, so the "price"
    // and "discount" entries are easy to pick out; the detail lists everything that moved.
    const changes = describeChanges(before, item, ITEM_CHANGES);
    const detail = summariseChanges(before?.name ?? item.name, changes);
    if (detail) {
      const action: AuditAction = before && before.pricePaise !== item.pricePaise ? "menu.item.price" : before && before.discountPercent !== item.discountPercent ? "menu.item.discount" : "menu.item.edit";
      await logMenu(user.id, action, before ? subjectOf(before.restaurant) : await restaurantSubject(item.restaurantId), detail);
    }
    return NextResponse.json({ item });
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

  if (body.action === "item.discount") {
    const ids = [...new Set(body.ids)];
    // Refuse rather than quietly skip: the owner should learn a Domino's dish was in the pick.
    const dominosCount = await prisma.menuItem.count({ where: { id: { in: ids }, restaurant: { orderMode: DOMINOS_MODE } } });
    if (dominosCount > 0) throw new Error(DOMINOS_MANAGED_MESSAGE);
    const where = { id: { in: ids }, restaurant: { orderMode: MAIN_STORE_MODE } } as const;
    const [, items] = await prisma.$transaction([
      prisma.menuItem.updateMany({ where, data: { discountPercent: body.discountPercent } }),
      prisma.menuItem.findMany({ where, include: itemInclude })
    ]);
    if (!items.length) throw new Error("Those items were already removed. Refresh and try again.");
    // One row for the whole batch: how many, and the first few names.
    const restaurantIds = [...new Set(items.map((item) => item.restaurantId))];
    const what = body.discountPercent === 0 ? "Removed the discount from" : `Set a ${body.discountPercent}% discount on`;
    await recordAudit({
      actorId: user.id,
      action: "menu.item.discount.bulk",
      targetType: "restaurant",
      targetId: restaurantIds.length === 1 ? restaurantIds[0] : null,
      detail: `${what} ${plural(items.length, "item")}: ${shortList(items.map((item) => item.name))}`
    });
    return NextResponse.json({ items });
  }

  if (body.action === "item.stock") {
    const before = await itemBefore(body.id);
    const item = await prisma.menuItem.update({
      where: { id: body.id },
      include: itemInclude,
      data: { available: body.available }
    });
    if (!before || before.available !== item.available) {
      const subject = before ? subjectOf(before.restaurant) : await restaurantSubject(item.restaurantId);
      await logMenu(user.id, "menu.item.stock", subject, `${subject.name}: "${item.name}" marked ${item.available ? "back in stock" : "sold out"}`);
    }
    return NextResponse.json({ item });
  }

  if (body.action === "combo.create") {
    await assertItemsBelongToRestaurant(body.restaurantId, body.items.map((line) => line.menuItemId));
    const combo = await prisma.combo.create({
      data: {
        restaurantId: body.restaurantId,
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
        comboPricePaise: body.comboPricePaise,
        items: { create: body.items.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })) }
      },
      include: comboInclude
    });
    const subject = await restaurantSubject(combo.restaurantId);
    await logMenu(user.id, "menu.combo.create", subject, `${subject.name}: added combo "${combo.name}" at ${rupees(combo.comboPricePaise)} (${plural(combo.items.length, "item")})`);
    return NextResponse.json({ combo });
  }

  if (body.action === "combo.update") {
    const existing = await prisma.combo.findUnique({ where: { id: body.id } });
    if (!existing) throw new Error("That combo was already removed. Refresh and try again.");
    if (body.items) {
      await assertItemsBelongToRestaurant(existing.restaurantId, body.items.map((line) => line.menuItemId));
    }
    // Replacing the item set is a delete-all + recreate inside one transaction so a
    // combo is never left half-updated.
    const combo = await prisma.$transaction(async (tx) => {
      await tx.combo.update({
        where: { id: body.id },
        data: {
          name: body.name,
          description: body.description,
          imageUrl: body.imageUrl,
          comboPricePaise: body.comboPricePaise
        }
      });
      if (body.items) {
        await tx.comboItem.deleteMany({ where: { comboId: body.id } });
        await tx.comboItem.createMany({
          data: body.items.map((line) => ({ comboId: body.id, menuItemId: line.menuItemId, quantity: line.quantity }))
        });
      }
      return tx.combo.findUnique({ where: { id: body.id }, include: comboInclude });
    });
    const changes = describeChanges(existing, combo ?? {}, [
      { key: "name", label: "name", kind: "text" },
      { key: "comboPricePaise", label: "price", kind: "money" },
      { key: "description", label: "description", kind: "changed" },
      { key: "imageUrl", label: "photo", kind: "changed" }
    ]);
    if (body.items) changes.push("items changed");
    const detail = summariseChanges(`${existing.name} (combo)`, changes);
    if (detail) await logMenu(user.id, "menu.combo.update", await restaurantSubject(existing.restaurantId), detail);
    return NextResponse.json({ combo });
  }

  if (body.action === "combo.active") {
    const combo = await prisma.combo.update({
      where: { id: body.id },
      data: { active: body.active },
      include: comboInclude
    });
    const subject = await restaurantSubject(combo.restaurantId);
    await logMenu(user.id, "menu.combo.active", subject, `${subject.name}: combo "${combo.name}" switched ${combo.active ? "on" : "off"}`);
    return NextResponse.json({ combo });
  }

  if (body.action === "combo.delete") {
    const combo = await prisma.combo.delete({ where: { id: body.id } });
    const subject = await restaurantSubject(combo.restaurantId);
    await logMenu(user.id, "menu.combo.delete", subject, `${subject.name}: deleted combo "${combo.name}"`);
    return NextResponse.json({ combo });
  }

  const before = await itemBefore(body.id);
  const item = await prisma.menuItem.delete({
    where: { id: body.id }
  });
  const subject = before ? subjectOf(before.restaurant) : await restaurantSubject(item.restaurantId);
  await logMenu(user.id, "menu.item.delete", subject, `${subject.name}: deleted "${item.name}" (${rupees(item.pricePaise)})`);
  return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = issue?.path.join(".") || "input";
      return NextResponse.json({ error: issue ? `${field}: ${issue.message}` : "Invalid input" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Action failed";
    // Prisma unique-constraint (e.g. duplicate coupon code / restaurant slug)
    let friendly = message;
    if (message.includes("Unique constraint")) {
      friendly = "That value already exists (duplicate code or name).";
    } else if (message.includes("MenuItem_courseId_fkey")) {
      friendly = "This course still has menu items. Delete or move them to another course first.";
    } else if (message.includes("Foreign key constraint")) {
      friendly = "This can't be deleted because other records still depend on it.";
    } else if (message.includes("Record to delete does not exist") || message.includes("No record was found")) {
      friendly = "That item was already removed. Refresh and try again.";
    }
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
