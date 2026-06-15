import { Bot, InlineKeyboard } from "grammy";
import { NotificationEvent } from "@prisma/client";
import { prisma } from "../lib/db";
import { env, requireEnv } from "../lib/env";
import { allowedTelegramAdmins } from "../lib/telegram";
import { markAllReachedCampus, releaseHostelDeliveries } from "../lib/orders";
import { formatPaise } from "../lib/utils";

const bot = new Bot(requireEnv("TELEGRAM_BOT_TOKEN"));
const admins = allowedTelegramAdmins();

function isAllowedAdmin(id?: number) {
  return id ? admins.has(String(id)) : false;
}

function adminKeyboard() {
  return new InlineKeyboard()
    .text("Open Orders", "open_orders")
    .text("Close Orders", "close_orders")
    .row()
    .text("Mark Reached Campus", "reached_campus")
    .text("Assign For Delivery", "assign_delivery")
    .row()
    .text("Show All Orders", "show_orders");
}

type ReplyContext = {
  reply: (text: string, options?: { parse_mode: "HTML" }) => Promise<unknown>;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function replyHtmlInChunks(ctx: ReplyContext, text: string) {
  const chunks: string[] = [];
  let current = "";

  for (const block of text.split("\n\n")) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > 3500) {
      if (current) chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "HTML" });
  }
}

bot.command("start", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) {
    await ctx.reply("This bot is restricted to admins.");
    return;
  }
  await ctx.reply("Admin controls", { reply_markup: adminKeyboard() });
});

bot.command("admin", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) {
    await ctx.reply("This bot is restricted to admins.");
    return;
  }
  await ctx.reply("Admin controls", { reply_markup: adminKeyboard() });
});

bot.callbackQuery("open_orders", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Not allowed");
  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: { ordersOpen: true },
    create: { id: "default", ordersOpen: true }
  });
  await ctx.answerCallbackQuery("Orders opened");
  await ctx.reply("Public ordering is now open.");
});

bot.callbackQuery("close_orders", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Not allowed");
  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: { ordersOpen: false },
    create: { id: "default", ordersOpen: false }
  });
  await ctx.answerCallbackQuery("Orders closed");
  await ctx.reply("Public ordering is now closed.");
});

bot.callbackQuery("reached_campus", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Not allowed");
  await ctx.answerCallbackQuery("Marking orders...");
  const result = await markAllReachedCampus();
  await ctx.reply(`${result.count} active orders marked as reached campus. Email and WhatsApp notifications were triggered.`);
});

bot.callbackQuery("assign_delivery", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Not allowed");
  const result = await releaseHostelDeliveries();
  await ctx.answerCallbackQuery("Delivery release complete");
  await ctx.reply(`${result.count} new hostel orders released to delivery persons. Existing released orders were not duplicated.`);
});

bot.callbackQuery("show_orders", async (ctx) => {
  if (!isAllowedAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Not allowed");
  const orders = await prisma.order.findMany({
    where: {
      status: { not: "CANCELLED" }
    },
    include: {
      restaurant: true,
      items: true
    },
    orderBy: [{ restaurant: { name: "asc" } }, { createdAt: "asc" }]
  });

  const grouped = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.restaurant.name;
    grouped.set(key, [...(grouped.get(key) ?? []), order]);
  }

  const lines = [
    "<b>Dish2Door Orders</b>",
    `<b>Total active orders:</b> ${orders.length}`,
    `<b>Restaurants:</b> ${grouped.size}`
  ];

  for (const [restaurant, restaurantOrders] of grouped) {
    lines.push("", `<b>${escapeHtml(restaurant)}</b>`, `<i>${restaurantOrders.length} order${restaurantOrders.length === 1 ? "" : "s"}</i>`);
    restaurantOrders.forEach((order, index) => {
      const delivery = order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate";
      const items = order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
      lines.push(
        "",
        `<b>${index + 1}. ${escapeHtml(order.customerName)}</b>`,
        `Phone: <code>${escapeHtml(order.customerPhone)}</code>`,
        `Delivery: <b>${escapeHtml(delivery)}</b>`,
        `Status: ${escapeHtml(order.status.replaceAll("_", " "))}`,
        `Payment: ${escapeHtml(order.paymentStatus.replaceAll("_", " "))}`,
        `Items: ${escapeHtml(items)}`,
        `Total: <b>${escapeHtml(formatPaise(order.totalPaise))}</b>`
      );
    });
  }

  await ctx.answerCallbackQuery("Orders listed");
  await replyHtmlInChunks(ctx, lines.join("\n"));
});

bot.catch((error) => {
  console.error("Telegram bot error", error);
});

bot.start({
  onStart: () => {
    console.log(`Telegram bot started. Admin IDs: ${env.TELEGRAM_ADMIN_IDS || "none configured"}`);
  }
});
