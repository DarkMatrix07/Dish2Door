import { prisma } from "@/lib/db";

export const DEFAULT_SETTINGS_ID = "default";

export async function getSettings() {
  return prisma.systemSettings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    update: {},
    create: { id: DEFAULT_SETTINGS_ID }
  });
}

export type FeeSettings = Awaited<ReturnType<typeof getSettings>>;
