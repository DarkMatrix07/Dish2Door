import Link from "next/link";
import { AdminPageHeader, PageContainer, SectionCard } from "@/components/admin/AdminShell";
import { EmptyState } from "@/components/admin/EmptyState";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { linkButtonClasses } from "@/components/ui/button";
import { AUDIT_GROUPS, AUDIT_GROUP_LABELS, AUDIT_OUTCOME_LABELS, auditActionLabel, type AuditOutcome } from "@/lib/audit-actions";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_RANGES,
  AUDIT_RANGE_LABELS,
  UNKNOWN_WHO,
  auditParamsFromRecord,
  auditSearchToParams,
  auditTargetLink,
  buildAuditWhere,
  parseAuditSearch,
  type AuditSearch
} from "@/lib/audit-search";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIstFull } from "@/lib/ist-day";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/activity";

const chipClasses = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition",
    active ? "border-neutral-950 bg-neutral-950 text-white!" : "border-neutral-200 bg-white text-neutral-700! hover:bg-neutral-50"
  );

const fieldClasses =
  "mt-1 h-11 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-950";

function actorName(row: { actor: { name: string } | null; action: string; outcome: string }) {
  if (row.actor) return row.actor.name;
  // A failed sign-in that matched no account has no person to name.
  return row.action === "staff.login" && row.outcome === "failed" ? "Someone (failed sign-in)" : "A removed account";
}

export default async function AdminActivityPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const query = auditParamsFromRecord(await searchParams);
  const search = parseAuditSearch(query);
  const where = buildAuditWhere(search);

  // Staff are few, so the whole list is cheap; the rows themselves are counted and paged in
  // the database, never loaded all at once.
  const [people, total] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.auditEvent.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(readPage(query.get("page") ?? undefined), totalPages);
  const rows = await prisma.auditEvent.findMany({
    where,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      outcome: true,
      detail: true,
      createdAt: true,
      actor: { select: { name: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE
  });

  const href = (patch: Partial<AuditSearch>) => {
    const text = new URLSearchParams(auditSearchToParams({ ...search, ...patch })).toString();
    return text ? `${BASE_PATH}?${text}` : BASE_PATH;
  };
  const pagerParams = auditSearchToParams(search);
  const filtered = Object.keys(pagerParams).length > 0;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Admin"
        title="Activity log"
        description="Who changed what, and when: menu prices, coupons, order actions, settings and staff sign-ins. Newest first. Times are India time."
      />

      <SectionCard title="Find activity" bodyClassName="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="What happened">
          <Link href={href({ group: null })} aria-current={search.group === null ? "true" : undefined} className={chipClasses(search.group === null)}>
            Everything
          </Link>
          {AUDIT_GROUPS.map((group) => (
            <Link key={group} href={href({ group })} aria-current={search.group === group ? "true" : undefined} className={chipClasses(search.group === group)}>
              {AUDIT_GROUP_LABELS[group]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {AUDIT_RANGES.map((range) => (
            <Link key={range} href={href({ range })} aria-current={search.range === range ? "true" : undefined} className={chipClasses(search.range === range)}>
              {AUDIT_RANGE_LABELS[range]}
            </Link>
          ))}
        </div>
        <form action={BASE_PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_auto] lg:items-end">
          {search.group ? <input type="hidden" name="group" value={search.group} /> : null}
          {search.range !== "all" ? <input type="hidden" name="range" value={search.range} /> : null}
          <Dropdown
            name="who"
            label="Who"
            defaultValue={search.who ?? ""}
            searchPlaceholder="Search people"
            options={[
              { value: "", label: "Everyone" },
              ...people.map((person) => ({ value: person.id, label: `${person.name}${person.role === "DELIVERY" ? " (delivery)" : ""}` })),
              { value: UNKNOWN_WHO, label: "Failed sign-ins" }
            ]}
          />
          <label className="block text-xs font-semibold text-neutral-500">
            Search the details
            <input
              name="q"
              defaultValue={search.q}
              maxLength={80}
              placeholder="An item, coupon code or order code"
              className={cn(fieldClasses, "px-3")}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="h-11 flex-1 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white lg:flex-none">
              Show activity
            </button>
            {filtered ? (
              <Link href={BASE_PATH} className={cn(linkButtonClasses("outline", "sm"), "h-11")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Activity" description="Tap “Open” on a row to go to the order, customer, menu or setting it is about." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const link = auditTargetLink(row.action, row.targetType, row.targetId);
            const outcome = row.outcome as AuditOutcome;
            return (
              <div key={row.id} className="flex flex-col gap-2 p-4 sm:p-5 lg:flex-row lg:items-start lg:gap-6">
                <div className="shrink-0 text-sm lg:w-52">
                  <p className="font-semibold text-neutral-900">{actorName(row)}</p>
                  <p className="mt-0.5 text-neutral-500">{formatIstFull(row.createdAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{auditActionLabel(row.action)}</Badge>
                    {outcome === "refused" || outcome === "failed" ? (
                      <Badge tone={outcome === "failed" ? "red" : "amber"}>{AUDIT_OUTCOME_LABELS[outcome]}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 break-words text-sm text-neutral-700">{row.detail ?? "No more details."}</p>
                </div>
                {link ? (
                  <Link href={link.href} className={cn(linkButtonClasses("outline", "sm"), "shrink-0 self-start")}>
                    {link.label}
                  </Link>
                ) : null}
              </div>
            );
          })}
          {!rows.length ? (
            <EmptyState
              title={filtered ? "No activity matches these filters" : "Nothing has been recorded yet"}
              description={
                filtered
                  ? "Try a longer date range or fewer filters."
                  : "Changes made from now on show up here: prices, discounts, coupons, order actions, settings and sign-ins."
              }
              action={filtered ? <Link href={BASE_PATH} className={linkButtonClasses("outline", "sm")}>Clear filters</Link> : undefined}
            />
          ) : null}
        </div>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <Pager basePath={BASE_PATH} params={pagerParams} page={page} totalPages={totalPages} total={total} shown={rows.length} noun="entries" />
        </div>
      </SectionCard>
    </PageContainer>
  );
}
