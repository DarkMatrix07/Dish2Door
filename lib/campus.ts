import { PublicError } from "@/lib/public-error";
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
    hostelDeliveryNightOnly: campus.hostelDeliveryNightOnly,
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

// An explicit code must be that campus and active. An omitted code may use the
// documented active default only. Inactive and unknown codes are rejected.
export async function resolveCampus(code?: string | null, options?: { allowDefault?: boolean }) {
  const wanted = code?.trim();
  if (wanted) {
    const campus = await prisma.campus.findUnique({ where: { code: wanted } });
    if (!campus || !campus.active) {
      throw new PublicError("That campus is not accepting orders.");
    }
    return campus;
  }

  if (options?.allowDefault === false) {
    throw new PublicError("Choose a campus before placing the order.");
  }

  const fallback = await prisma.campus.findUnique({ where: { code: DEFAULT_CAMPUS_CODE } });
  if (fallback?.active) return fallback;
  throw new PublicError("Choose a campus before placing the order.");
}
