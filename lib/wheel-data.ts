// The database side of the Discount wheel page. A prize points at its coupon only by
// code (there is no relation), so the list is a raw join; every value that reaches the
// SQL is a bound parameter or comes from a fixed allow-list.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { likePattern, phoneDigits, type PrizeSearch, type PrizeStatus } from "@/lib/wheel-stats";

export type PrizeRow = {
  id: string;
  phone: string;
  customerName: string | null;
  discountPercent: number;
  couponCode: string;
  createdAt: Date;
  couponExpiresAt: Date | null;
  issuedById: string | null;
  issuedByName: string | null;
  issuedNote: string | null;
  orderCode: string | null;
  status: PrizeStatus;
};

// The same rule as prizeStatus() in lib/wheel-stats.ts, in SQL, so filtering by status in
// the database agrees with the badge on each row. `now` is a UTC instant; the columns are
// timestamps without a zone that hold UTC.
function statusSql(now: Date) {
  return Prisma.sql`CASE
    WHEN r."redeemedAt" IS NOT NULL THEN 'used'
    WHEN r."expiredAt" IS NOT NULL OR (c."expiresAt" IS NOT NULL AND c."expiresAt" <= ${now}::timestamp) THEN 'expired'
    ELSE 'waiting' END`;
}

const FROM_SQL = Prisma.sql`
  FROM "SpinReward" r
  LEFT JOIN "Customer" cu ON cu.phone = r.phone
  LEFT JOIN "Coupon" c ON c.code = r."couponCode"
  LEFT JOIN "User" u ON u.id = r."issuedById"
  LEFT JOIN "Order" o ON o.id = r."orderId"`;

function whereSql(search: PrizeSearch, now: Date) {
  const clauses: Prisma.Sql[] = [];
  if (search.status) clauses.push(Prisma.sql`${statusSql(now)} = ${search.status}`);
  if (search.source === "won") clauses.push(Prisma.sql`r."issuedById" IS NULL`);
  if (search.source === "given") clauses.push(Prisma.sql`r."issuedById" IS NOT NULL`);
  if (search.search) {
    const text = likePattern(search.search);
    const digits = phoneDigits(search.search);
    const matches = [
      Prisma.sql`r."couponCode" ILIKE ${text}`,
      Prisma.sql`cu.name ILIKE ${text}`,
      Prisma.sql`r.name ILIKE ${text}`,
      Prisma.sql`r.phone ILIKE ${text}`
    ];
    if (digits) matches.push(Prisma.sql`r.phone LIKE ${likePattern(digits)}`);
    clauses.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
  }
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

export async function loadPrizes(search: PrizeSearch, page: number, pageSize: number, now = new Date()) {
  const where = whereSql(search, now);
  const [rows, [count]] = await Promise.all([
    prisma.$queryRaw<Array<Omit<PrizeRow, "status"> & { status: string }>>`
      SELECT r.id, r.phone, COALESCE(cu.name, r.name) AS "customerName", r."discountPercent", r."couponCode",
             r."createdAt", c."expiresAt" AS "couponExpiresAt", r."issuedById", u.name AS "issuedByName",
             r."issuedNote", o."trackingCode" AS "orderCode", ${statusSql(now)} AS status
      ${FROM_SQL}
      ${where}
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total ${FROM_SQL} ${where}`
  ]);
  return { rows: rows.map((row) => ({ ...row, status: row.status as PrizeStatus })), total: count?.total ?? 0 };
}

// How many prizes sit in each status, for the whole list (not just the current filter).
export async function loadPrizeStatusCounts(now = new Date()) {
  const rows = await prisma.$queryRaw<Array<{ status: string; total: number }>>`
    SELECT ${statusSql(now)} AS status, COUNT(*)::int AS total ${FROM_SQL} GROUP BY 1`;
  const counts: Record<PrizeStatus, number> = { waiting: 0, used: 0, expired: 0 };
  for (const row of rows) if (row.status in counts) counts[row.status as PrizeStatus] = row.total;
  return counts;
}

