import { NextResponse } from "next/server";
import { z } from "zod";
import { RewardActionError } from "@/lib/admin-rewards-db";

// Turns whatever went wrong in a prize action into a plain message and the right status,
// so the two routes answer errors the same way and never leak a database error.
export function rewardErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return NextResponse.json({ error: issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid input" }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (error instanceof RewardActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[admin rewards]", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
