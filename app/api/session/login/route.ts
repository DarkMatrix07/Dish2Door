import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["ADMIN", "DELIVERY"]).optional()
});

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user || !user.active || (body.role && user.role !== body.role)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createAppSession(user.id);
  return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
}
