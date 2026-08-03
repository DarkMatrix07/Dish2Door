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

// Updates a single WHATSAPP-mode shop's own row (not its courses/items/combos — those
// go through /api/admin/menu). Scoped by slug since each WhatsApp shop gets its own
// dedicated admin section rather than a restaurant picker.
const schema = z.object({
  slug: z.string().min(1),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  acceptingOrders: z.boolean().optional(),
  whatsappNumber: z.string().trim().max(20).nullable().optional(),
  restrictedToCampusCode: z.string().trim().min(1).nullable().optional()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug, ...data } = schema.parse(await request.json());
    const restaurant = await prisma.restaurant.update({ where: { slug }, data });
    return NextResponse.json({ restaurant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return NextResponse.json(
        { error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Could not update shop";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
