// Spreadsheet apps run a cell that starts with one of these as a formula, so a customer
// who types =HYPERLINK(...) as their name could otherwise execute it on an admin's
// machine. A leading single quote makes the cell plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvValue = string | number | null | undefined;

export function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  // Our own numbers are written as-is so a negative amount stays a number.
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: CsvValue[]) {
  return values.map(csvCell).join(",");
}
