import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  secret: env.BETTER_AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "development-only-change-me",
  emailAndPassword: {
    enabled: true
  },
  plugins: [nextCookies()]
});
