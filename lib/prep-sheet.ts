// The printable Afternoon / Night prep sheet, built as one HTML document. It moved here
// unchanged from the old Today's orders page so the Today board and the sheet share the
// same grouping code; the markup, styles and wording are exactly what they were. Pure
// (no window, no toast) so the output can be tested; components/admin/print-prep-sheet.ts
// is the part that opens the print window.
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
      const campusSummary = summaryLine(aggregateItems(campusOrders));
      const restaurantSections = restaurants
        .map(([name, restaurantOrders]) => {
          const summary = summaryLine(aggregateItems(restaurantOrders));
          const rows = restaurantOrders
            .map(
              (o, i) => `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(o.customerName)}<br><span class="muted">${escapeHtml(o.customerPhone)}</span></td>
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
          <p class="summary campus-summary"><strong>Campus total to prepare:</strong> ${campusSummary}</p>
          ${restaurantSections}
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
        section.campus.page-break { page-break-before: always; }
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
