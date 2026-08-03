import type { Campus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CampusPublic } from "@/lib/customer-campus";

export type { CampusPublic };

// The campus a customer is served by. Restaurants are shared across campuses, so this
// only decides pricing and whether hostel delivery is offered. Fees are always resolved
// from the database at order time — the client tells us WHICH campus, never what it costs.

export const DEFAULT_CAMPUS_CODE = "VIT_AP";

export function toPublicCampus(campus: Campus): CampusPublic {
  return {
    code: campus.code,
    name: campus.name,
    platformFeePaise: campus.platformFeePaise,
    hostelDeliveryFeePaise: campus.hostelDeliveryFeePaise,
    hostelDeliveryEnabled: campus.hostelDeliveryEnabled,
    paymentChargePercentBps: campus.paymentChargePercentBps,
    paymentChargeFixedPaise: campus.paymentChargeFixedPaise
  };
}

export async function listActiveCampuses() {
  return prisma.campus.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

// Resolves the campus for an order. Falls back to the default campus so a stale client
// (or an older admin form that never sent a campus) can still place an order.
export async function resolveCampus(code?: string | null) {
  const wanted = code?.trim();
  if (wanted) {
    const campus = await prisma.campus.findUnique({ where: { code: wanted } });
    if (campus?.active) return campus;
  }
  const fallback = await prisma.campus.findUnique({ where: { code: DEFAULT_CAMPUS_CODE } });
  if (fallback) return fallback;
  // Nothing seeded yet (e.g. a brand-new database): use the first active campus.
  const [first] = await listActiveCampuses();
  if (!first) throw new Error("No campus is configured. Add one in admin before taking orders.");
  return first;
}
