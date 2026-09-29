import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
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
  return NextResponse.json(result);
}
