import { toast } from "sonner";
import { buildPrepSheet, type PrepSheetSlot } from "@/lib/prep-sheet";
import type { BoardOrder } from "@/lib/today-board";

// Opens the printable prep sheet in a new window and starts the print dialog (the browser
// offers "Save as PDF"). window.open has to run straight from the click, before any await,
// or the browser treats it as an unwanted pop-up.
export function printPrepSheet(orders: BoardOrder[], slot: PrepSheetSlot, dateLabel: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    toast.error("Allow pop-ups to generate the PDF.");
    return;
  }
  const { html, title } = buildPrepSheet({ orders, slot, dateLabel });
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  win.focus();
  win.print();
}
