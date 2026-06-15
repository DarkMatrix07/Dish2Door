import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [orders, settings] = await Promise.all([
    prisma.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    getSettings()
  ]);

  return NextResponse.json({ orders, settings });
}
