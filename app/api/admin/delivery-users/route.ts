import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HOSTEL_BLOCKS } from "@/lib/hostels";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6).max(20).optional(),
    password: z.string().min(6),
    assignedHostelBlocks: z.array(z.enum(HOSTEL_BLOCKS)).default([])
  }),
  z.object({
    action: z.literal("update"),
    id: z.string(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).nullable().optional(),
    active: z.boolean().optional(),
    assignedHostelBlocks: z.array(z.enum(HOSTEL_BLOCKS)).optional()
  }),
  z.object({
    action: z.literal("resetPassword"),
    id: z.string(),
    password: z.string().min(6)
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string()
  })
]);

export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { role: "DELIVERY" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      assignedHostelBlocks: true,
      createdAt: true,
      _count: { select: { deliveries: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.parse(await request.json());

  if (body.action === "create") {
    const deliveryUser = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        role: "DELIVERY",
        passwordHash: await hashPassword(body.password),
        assignedHostelBlocks: body.assignedHostelBlocks
      },
      select: { id: true, name: true, email: true, phone: true, active: true, assignedHostelBlocks: true }
    });
    return NextResponse.json({ user: deliveryUser });
  }

  if (body.action === "update") {
    const existing = await prisma.user.findFirst({ where: { id: body.id, role: "DELIVERY" }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Delivery person not found" }, { status: 404 });

    const deliveryUser = await prisma.user.update({
      where: { id: body.id },
      data: {
        name: body.name,
        email: body.email?.toLowerCase(),
        phone: body.phone,
        active: body.active,
        assignedHostelBlocks: body.assignedHostelBlocks
      },
      select: { id: true, name: true, email: true, phone: true, active: true, assignedHostelBlocks: true }
    });
    return NextResponse.json({ user: deliveryUser });
  }

  if (body.action === "resetPassword") {
    const existing = await prisma.user.findFirst({ where: { id: body.id, role: "DELIVERY" }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Delivery person not found" }, { status: 404 });

    const deliveryUser = await prisma.user.update({
      where: { id: body.id },
      data: {
        passwordHash: await hashPassword(body.password),
        appSessions: { deleteMany: {} },
        sessions: { deleteMany: {} }
      },
      select: { id: true, name: true, email: true }
    });
    return NextResponse.json({ user: deliveryUser });
  }

  const deliveredOrders = await prisma.order.count({ where: { deliveredById: body.id } });
  if (deliveredOrders > 0) {
    return NextResponse.json({ error: "This delivery person has order history. Deactivate instead." }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { id: body.id, role: "DELIVERY" }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Delivery person not found" }, { status: 404 });

  const deliveryUser = await prisma.user.delete({
    where: { id: body.id },
    select: { id: true }
  });
  return NextResponse.json({ user: deliveryUser });
}
