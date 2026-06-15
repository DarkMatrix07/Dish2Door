import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_IDS: z.string().optional(),
  TELEGRAM_GROUP_ID: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_DEFAULT_COUNTRY_CODE: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000")
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_IDS: process.env.TELEGRAM_ADMIN_IDS,
  TELEGRAM_GROUP_ID: process.env.TELEGRAM_GROUP_ID,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  WHATSAPP_API_URL: process.env.WHATSAPP_API_URL,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
  WHATSAPP_DEFAULT_COUNTRY_CODE: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
});

export function requireEnv<Key extends keyof typeof env>(key: Key): Exclude<(typeof env)[Key], undefined> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`${key} is not configured`);
  }
  return value as Exclude<(typeof env)[Key], undefined>;
}
