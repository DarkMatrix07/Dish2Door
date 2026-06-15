import { NextResponse } from "next/server";
import { destroyAppSession } from "@/lib/auth";

export async function POST() {
  await destroyAppSession();
  return NextResponse.json({ ok: true });
}
