import { Bot } from "grammy";
import { env, requireEnv } from "@/lib/env";
import type { FullOrder } from "@/lib/order-types";
import { formatPaise } from "@/lib/utils";

export function telegramOrderText(order: FullOrder) {
  const items = order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
  const delivery = order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate";

  return [
    "New Order",
    "",
    `Restaurant: ${order.restaurant.name}`,
    `Customer: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `Delivery: ${delivery}`,
    `Items: ${items}`,
    `Total: ${formatPaise(order.totalPaise)}`,
    `Status: ${order.status.replaceAll("_", " ")}`
  ].join("\n");
}

export async function sendTelegramGroupMessage(text: string) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const groupId = requireEnv("TELEGRAM_GROUP_ID");
  const bot = new Bot(token);
  await bot.api.sendMessage(groupId, text);
}

export function allowedTelegramAdmins() {
  return new Set(
    (env.TELEGRAM_ADMIN_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}
