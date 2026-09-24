import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  secret: (() => {
    const secret = env.BETTER_AUTH_SECRET ?? env.NEXTAUTH_SECRET;
    if (process.env.NODE_ENV === "production") {
      if (!secret || secret.length < 32 || secret.includes("change-me") || secret.includes("development-only")) {
        throw new Error("A strong BETTER_AUTH_SECRET is required in production");
      }
      return secret;
    }
    return secret ?? "development-only-change-me";
  })(),
  emailAndPassword: {
    enabled: false,
    disableSignUp: true
  },
  plugins: [nextCookies()]
});
