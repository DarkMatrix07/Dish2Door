import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { plural, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { markAllReachedCampus, markReachedCampusFor } from "@/lib/orders";

// Optional scope. A key left out means "do not filter on it"; null means the orders with no
// campus / no slot. No body at all (the dashboard button, Telegram) sweeps all of today.
// strict(): a misspelt key such as "campus" must be an error, not silently a whole-day
// sweep that messages every customer.
const scopeSchema = z
  .object({
    campusId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
    slot: z.enum(["AFTERNOON", "NIGHT"]).nullable().optional()
  })
  .strict();

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }

  const parsed = scopeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { campusId, slot } = parsed.data;
  const result =
    campusId === undefined && slot === undefined
      ? await markAllReachedCampus()
      : await markReachedCampusFor({ campusId, slot });

  // Nothing moved means nothing happened worth a row. Who pressed it, and for which
  // campus and slot, is what the owner asks about afterwards. (The orders themselves are
  // not listed: the sweep reports only how many it moved.)
  if (result.count > 0) {
    const campus = typeof campusId === "string"
      ? await prisma.campus.findUnique({ where: { id: campusId }, select: { name: true } }).catch(() => null)
      : null;
    const scope = [
      campusId === undefined ? null : campusId === null ? "orders with no campus" : campus?.name ?? "one campus",
      slot === undefined ? null : slot === null ? "orders with no slot" : `${slot.toLowerCase()} slot`
    ].filter(Boolean);
    await recordAudit({
      actorId: user.id,
      action: "order.reached_bulk",
      targetType: "order",
      detail: `Marked ${plural(result.count, "order")} as reached campus (${scope.length ? scope.join(", ") : "all of today's confirmed orders"})`
    });
  }
  return NextResponse.json(result);
}
