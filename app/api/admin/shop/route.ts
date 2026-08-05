import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeIndianWhatsAppNumber } from "@/lib/whatsapp-order";

// Stored in wa.me form (91XXXXXXXXXX). Accepts whatever the admin types — 9876543210,
// +91 98765 43210, 09876543210 — and rejects anything that isn't an Indian mobile,
// because a number without a country code produces a wa.me link WhatsApp can't open.
const whatsappNumberSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value, context) => {
    const normalized = normalizeIndianWhatsAppNumber(value);
    if (!normalized) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

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
  whatsappNumber: whatsappNumberSchema.nullable().optional(),
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
