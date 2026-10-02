import { prisma } from "@/lib/db";
import { safeRecord, type AuditEntry } from "@/lib/audit-actions";

export * from "@/lib/audit-actions";

// Adds one row to the admin activity log. It never throws: a failure to write the log is
// printed to the server log and the admin's own action carries on. Await it after the main
// write so rows appear in the order things happened.
//
// Keep `detail` to a short plain-English summary. Never put a password, passcode, PIN,
// token or full payment detail in it; the page shows it to every admin.
export function recordAudit(entry: AuditEntry) {
  return safeRecord((row) => prisma.auditEvent.create({ data: row }), entry);
}
