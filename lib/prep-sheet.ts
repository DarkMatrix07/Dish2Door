// The printable Afternoon / Night prep sheet, built as one HTML document: per campus, what
// each restaurant has to prepare, then a hostel delivery run grouped by block. Shares the
// Today board's grouping code. Pure (no window, no toast) so the output can be tested;
// components/admin/print-prep-sheet.ts is the part that opens the print window.
import { HOSTEL_BLOCKS } from "@/lib/hostels";
import { FULFILLABLE_PAYMENT_STATUSES } from "@/lib/order-filters";
import {
  aggregateItems,
  campusName,
  groupByCampus,
  groupByRestaurantName,
  type BoardOrder,
  type PrepLine
} from "@/lib/today-board";
import { formatPaise } from "@/lib/utils";

export type PrepSheetSlot = "AFTERNOON" | "NIGHT";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// The sheet says "Gate", not the board's "Gate pickup".
function sheetDeliveryLabel(order: { deliveryType: string; hostelBlock: string | null }) {
  return order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock ?? ""}`.trim() : "Gate";
}

function summaryLine(lines: PrepLine[]) {
  return lines.map((line) => `${line.quantity}× ${escapeHtml(line.name)}`).join(", ");
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Hostel orders grouped by block, in the order the blocks are listed at checkout
// (MH-1..MH-7, then LH-1..LH-4); anything unexpected goes last, A–Z.
function groupByHostelBlock(orders: BoardOrder[]) {
  const groups = new Map<string, BoardOrder[]>();
  for (const order of orders) {
    const block = order.hostelBlock?.trim() || "Block not given";
    groups.set(block, [...(groups.get(block) ?? []), order]);
  }
  const rank = (block: string) => {
    const index = (HOSTEL_BLOCKS as readonly string[]).indexOf(block);
    return index === -1 ? HOSTEL_BLOCKS.length : index;
  };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

// The hostel run: one list the runner carries, block by block, with a box to tick per
// order. Starts on its own page so it can be torn off and handed over.
function hostelRunSection(orders: BoardOrder[]) {
  const hostelOrders = orders.filter((order) => order.deliveryType === "HOSTEL");
  if (hostelOrders.length === 0) return "";
  const blocks = groupByHostelBlock(hostelOrders)
    .map(([block, blockOrders]) => {
      const rows = blockOrders
        .map(
          (o) => `<tr>
                    <td class="tick">☐</td>
                    <td><strong>${escapeHtml(o.trackingCode)}</strong></td>
                    <td>${escapeHtml(o.customerName)}<br><span class="muted">${escapeHtml(o.customerPhone)}</span></td>
                    <td>${escapeHtml(o.restaurant.name)}</td>
                    <td>${o.items.map((it) => `${it.quantity}× ${escapeHtml(it.nameSnapshot)}`).join("<br>")}</td>
                    <td class="right">${formatPaise(o.totalPaise)}${o.status === "DELIVERED" ? '<br><span class="muted">Delivered</span>' : ""}</td>
                  </tr>`
        )
        .join("");
      return `<section class="block">
              <h3>${escapeHtml(block)} <span class="muted">(${plural(blockOrders.length, "order")})</span></h3>
              <table>
                <thead><tr><th class="tick">✓</th><th>Code</th><th>Customer</th><th>Restaurant</th><th>Items</th><th class="right">Total</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </section>`;
    })
    .join("");
  return `<section class="hostel-run page-break">
          <h2 class="run-heading">Hostel delivery run <span class="muted">(${plural(hostelOrders.length, "order")})</span></h2>
          ${blocks}
        </section>`;
}

// What goes on the sheet: today's orders that were not cancelled and were paid (or are
// pay-later), delivered ones included, oldest first. This is the same set the old page
// queried for; the board's data also holds refunded rows, which the sheet still skips.
export function prepSheetOrders(orders: BoardOrder[]) {
  return orders
    .filter((order) => order.status !== "CANCELLED" && (FULFILLABLE_PAYMENT_STATUSES as string[]).includes(order.paymentStatus))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function prepSheetCount(orders: BoardOrder[], slot: PrepSheetSlot) {
  return prepSheetOrders(orders).filter((order) => order.orderSlot === slot).length;
}

export function buildPrepSheet({
  orders,
  slot,
  dateLabel,
  now = new Date()
}: {
  orders: BoardOrder[];
  slot: PrepSheetSlot;
  dateLabel: string;
  now?: Date;
}) {
  const slotLabel = slot === "NIGHT" ? "Deliver by Night" : "Deliver by Afternoon";
  const slotWord = slot === "NIGHT" ? "Night" : "Afternoon";
  // Default download filename (browsers use the document title): date + slot + time.
  const pad = (n: number) => String(n).padStart(2, "0");
  const fileTitle = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${slotWord} orders ${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}`;
  const slotOrders = prepSheetOrders(orders).filter((order) => order.orderSlot === slot);
  // Each campus is prepared/delivered separately, so it gets its own page (and own
  // totals) in the printed sheet, scoped within this slot.
  const campusGroups = groupByCampus(slotOrders);
  const body = campusGroups
    .map(({ campus, orders: campusOrders }, campusIndex) => {
      const restaurants = groupByRestaurantName(campusOrders);
      const hostelCount = campusOrders.filter((order) => order.deliveryType === "HOSTEL").length;
      const split = hostelCount > 0 ? `<p class="split">${campusOrders.length - hostelCount} gate · ${hostelCount} hostel</p>` : "";
      const campusSummary = summaryLine(aggregateItems(campusOrders));
      const restaurantSections = restaurants
        .map(([name, restaurantOrders]) => {
          const summary = summaryLine(aggregateItems(restaurantOrders));
          const rows = restaurantOrders
            .map(
              (o, i) => `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(o.customerName)}<br><span class="muted">${escapeHtml(o.customerPhone)} · ${escapeHtml(o.trackingCode)}</span></td>
                    <td>${escapeHtml(sheetDeliveryLabel(o))}</td>
                    <td>${o.items.map((it) => `${it.quantity}× ${escapeHtml(it.nameSnapshot)}`).join("<br>")}</td>
                    <td class="right">${formatPaise(o.totalPaise)}</td>
                  </tr>`
            )
            .join("");
          return `<section class="restaurant">
              <h2>${escapeHtml(name)} <span class="muted">(${restaurantOrders.length} order${restaurantOrders.length === 1 ? "" : "s"})</span></h2>
              <p class="summary"><strong>To prepare:</strong> ${summary}</p>
              <table>
                <thead><tr><th>#</th><th>Customer</th><th>Delivery</th><th>Items</th><th class="right">Total</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </section>`;
        })
        .join("");
      return `<section class="campus${campusIndex > 0 ? " page-break" : ""}">
          <h1 class="campus-heading">${escapeHtml(campusName(campus))} <span class="muted">(${campusOrders.length} order${campusOrders.length === 1 ? "" : "s"})</span></h1>
          ${split}
          <p class="summary campus-summary"><strong>Campus total to prepare:</strong> ${campusSummary}</p>
          ${restaurantSections}
          ${hostelRunSection(campusOrders)}
        </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileTitle)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 28px; }
        h1 { margin: 0 0 2px; font-size: 22px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
        section.restaurant { margin-bottom: 22px; page-break-inside: avoid; }
        section.campus.page-break, section.hostel-run.page-break { page-break-before: always; }
        .split { font-size: 12px; font-weight: bold; margin: 0 0 6px; }
        .run-heading { font-size: 18px; border-bottom: 3px solid #111; }
        section.block { margin-bottom: 14px; page-break-inside: avoid; }
        h3 { font-size: 15px; margin: 12px 0 6px; }
        .tick { width: 28px; text-align: center; font-size: 15px; }
        .campus-heading { font-size: 20px; border-bottom: 3px solid #111; padding-bottom: 6px; margin: 6px 0 8px; }
        .campus-summary { background: #eef2ff; }
        h2 { font-size: 17px; border-bottom: 2px solid #111; padding-bottom: 4px; margin: 18px 0 8px; }
        .summary { font-size: 12px; margin: 0 0 6px; background: #fff7ed; padding: 6px 8px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; }
        .right { text-align: right; white-space: nowrap; }
        .muted { color: #666; font-weight: normal; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Dish2Door — ${escapeHtml(slotLabel)}</h1>
      <div class="meta">${escapeHtml(dateLabel)} · ${slotOrders.length} order${slotOrders.length === 1 ? "" : "s"}</div>
      ${body || "<p>No orders in this slot.</p>"}
      </body></html>`;

  return { html, title: fileTitle, count: slotOrders.length };
}
