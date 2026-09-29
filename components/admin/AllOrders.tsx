"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Download, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { PaymentBadge, SlotBadge, StatusBadge, itemsSummary, sourceLabel, statusLabel } from "@/components/admin/OrderBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatIstFull } from "@/lib/ist-day";
import { statusTone } from "@/lib/order-labels";
import {
  DEFAULT_ORDER_SEARCH,
  PAGE_SIZE_CHOICES,
  istDatePresets,
  orderListParams,
  orderSearchToParams,
  parseOrderSearch,
  parsePaging,
  type OrderListRow,
  type OrderSearch,
  type OrderSearchResult
} from "@/lib/order-search";
import { cn, formatPaise, formatPaiseExact } from "@/lib/utils";

type Option = { id: string; name: string };

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-1";

const STATUS_OPTIONS = [
  ["ORDER_CONFIRMED", "Confirmed"],
  ["REACHED_CAMPUS", "Reached campus"],
  ["DELIVERED", "Delivered"],
  ["CANCELLED", "Cancelled"],
  ["AWAITING_CONFIRMATION", "Awaiting confirmation"]
] as const;

const PAYMENT_OPTIONS = [
  ["real", "Paid and pay-later orders"],
  ["paid_online", "Paid online"],
  ["paid_manually", "Paid manually"],
  ["pay_later", "Pay later"],
  ["unpaid", "Unpaid online checkouts"],
  ["everything", "Everything"]
] as const;

const SOURCE_OPTIONS = [
  ["CUSTOMER_ONLINE", "Website"],
  ["ADMIN_MANUAL", "Counter order"],
  ["CUSTOMER_WHATSAPP", "WhatsApp"]
] as const;

const SLOT_OPTIONS = [
  ["AFTERNOON", "Afternoon"],
  ["NIGHT", "Night"]
] as const;

function optionLabel(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

export function OrderListSkeleton() {
  return (
    <SectionCard bodyClassName="p-0">
      <div className="divide-y divide-neutral-100" role="status" aria-label="Loading orders">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex animate-pulse items-center gap-4 p-4 sm:px-5">
            <div className="h-9 w-24 rounded bg-neutral-100" />
            <div className="hidden h-9 w-36 rounded bg-neutral-100 sm:block" />
            <div className="h-9 flex-1 rounded bg-neutral-100" />
            <div className="h-6 w-16 rounded-full bg-neutral-100" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-bold text-neutral-500">
      {label}
      <Select className="mt-1 font-normal text-neutral-900" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

export function AllOrders({
  initial,
  initialQuery,
  campuses,
  restaurants
}: {
  initial: OrderSearchResult;
  initialQuery: string;
  campuses: Option[];
  restaurants: Option[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the only source of truth for filters and paging, so a link can be shared
  // and the back button steps through what the admin did.
  const filters = useMemo(() => parseOrderSearch(searchParams), [searchParams]);
  const { page, pageSize } = useMemo(() => parsePaging(searchParams), [searchParams]);
  const query = useMemo(() => orderListParams(filters, page, pageSize).toString(), [filters, page, pageSize]);

  const [data, setData] = useState({ query: initialQuery, result: initial });
  const [failure, setFailure] = useState<{ query: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const failed = failure?.query === query;
  const loading = data.query !== query && !failed;

  // History API calls are picked up by Next's router, which updates useSearchParams.
  // Typing uses replace so a burst of keystrokes does not fill the back stack.
  const go = useCallback(
    (params: URLSearchParams, mode: "push" | "replace" = "push") => {
      const text = params.toString();
      const url = text ? `${pathname}?${text}` : pathname;
      if (mode === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [pathname]
  );

  const change = useCallback(
    (patch: Partial<OrderSearch>, mode: "push" | "replace" = "push") => {
      // Any filter change goes back to the first page.
      go(orderListParams({ ...filters, ...patch }, 1, pageSize), mode);
    },
    [filters, pageSize, go]
  );

  // Search box: local text, debounced into the URL. `sentSearch` remembers what typing
  // last wrote, so the URL echoing it back is not mistaken for an outside change (such as
  // the back button) that should overwrite what the admin is still typing.
  const [text, setText] = useState(filters.search);
  const [sentSearch, setSentSearch] = useState(filters.search);
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    if (filters.search !== sentSearch) {
      setText(filters.search);
      setSentSearch(filters.search);
    }
  }
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === filters.search) return;
    const timer = setTimeout(() => {
      setSentSearch(trimmed.slice(0, 80));
      change({ search: trimmed }, "replace");
    }, 350);
    return () => clearTimeout(timer);
  }, [text, filters.search, change]);

  // Fetch whenever the URL asks for something other than what is on screen.
  useEffect(() => {
    if (data.query === query) return;
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    if (!params.has("pageSize")) params.set("pageSize", "25");
    params.set("summary", "1");
    fetch(`/api/admin/orders?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not load orders");
        return body as OrderSearchResult;
      })
      .then((result) => setData({ query, result }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setFailure({ query, message: error instanceof Error ? error.message : "Could not load orders" });
      });
    return () => controller.abort();
  }, [query, data.query, attempt]);

  const presets = istDatePresets();
  const sameRange = (range: { from: string; to: string }) => filters.dateFrom === range.from && filters.dateTo === range.to;
  const noDates = !filters.dateFrom && !filters.dateTo;
  const activeRange: "all" | "today" | "yesterday" | "last7" | "month" | "custom" = noDates
    ? "all"
    : sameRange(presets.today)
      ? "today"
      : sameRange(presets.yesterday)
        ? "yesterday"
        : sameRange(presets.last7)
          ? "last7"
          : sameRange(presets.month)
            ? "month"
            : "custom";
  const showCustom = customOpen || activeRange === "custom";
  // Opening the custom inputs takes over the highlight from the preset the dates match.
  const shownRange = showCustom ? "custom" : activeRange;

  function pickRange(range: { from: string; to: string } | null) {
    setCustomOpen(false);
    change({ dateFrom: range?.from ?? null, dateTo: range?.to ?? null });
  }

  // Keep the range sane while typing: the end never sits before the start.
  function setFrom(value: string) {
    const from = value || null;
    change({ dateFrom: from, dateTo: from && filters.dateTo && filters.dateTo < from ? from : filters.dateTo });
  }
  function setTo(value: string) {
    const to = value || null;
    change({ dateTo: to, dateFrom: to && filters.dateFrom && filters.dateFrom > to ? to : filters.dateFrom });
  }

  const nameOf = (options: Option[], id: string) => options.find((option) => option.id === id)?.name ?? id;
  const activeChips: { key: string; label: string; remove: Partial<OrderSearch> }[] = [];
  if (filters.campusId) activeChips.push({ key: "campus", label: `Campus: ${nameOf(campuses, filters.campusId)}`, remove: { campusId: null } });
  if (filters.restaurantId) activeChips.push({ key: "restaurant", label: `Restaurant: ${nameOf(restaurants, filters.restaurantId)}`, remove: { restaurantId: null } });
  if (filters.status) activeChips.push({ key: "status", label: `Status: ${statusLabel(filters.status)}`, remove: { status: null } });
  if (filters.payment !== "real") activeChips.push({ key: "payment", label: `Payment: ${optionLabel(PAYMENT_OPTIONS, filters.payment)}`, remove: { payment: "real" } });
  if (filters.source) activeChips.push({ key: "source", label: `Source: ${sourceLabel(filters.source)}`, remove: { source: null } });
  if (filters.slot) activeChips.push({ key: "slot", label: `Slot: ${optionLabel(SLOT_OPTIONS, filters.slot)}`, remove: { slot: null } });
  // Not in the panel, but a shared link can carry them, so they must be visible and removable.
  if (filters.deliveryType) activeChips.push({ key: "delivery", label: `Delivery: ${filters.deliveryType === "HOSTEL" ? "Hostel" : "Gate"}`, remove: { deliveryType: null } });
  if (filters.sessionId) activeChips.push({ key: "session", label: "One order session only", remove: { sessionId: null } });

  function clearFilters() {
    change({
      status: null,
      deliveryType: null,
      source: null,
      slot: null,
      payment: "real",
      restaurantId: null,
      campusId: null,
      sessionId: null
    });
  }

  function resetEverything() {
    setText("");
    setSentSearch("");
    setCustomOpen(false);
    go(orderListParams(DEFAULT_ORDER_SEARCH, 1, pageSize));
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const response = await fetch(`/api/admin/orders/export?${orderSearchToParams(filters).toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not export orders");
      }
      const blob = await response.blob();
      const fileName = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "orders.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (response.headers.get("X-Export-Truncated") === "1") {
        toast.warning("Only the newest 5,000 matching orders were exported. Narrow the dates to get the rest.");
      } else {
        const rows = response.headers.get("X-Export-Rows");
        toast.success(rows ? `Exported ${rows} orders` : "Export ready");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export orders");
    } finally {
      setExporting(false);
    }
  }

  const { orders, total, summary } = data.result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(total, (page - 1) * pageSize + orders.length);
  const hasNarrowing = activeChips.length > 0 || Boolean(filters.search) || !noDates;

  const filterFields = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <FilterSelect label="Campus" value={filters.campusId ?? ""} onChange={(value) => change({ campusId: value || null })}>
        <option value="">All campuses</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>{campus.name}</option>
        ))}
      </FilterSelect>
      <FilterSelect label="Restaurant" value={filters.restaurantId ?? ""} onChange={(value) => change({ restaurantId: value || null })}>
        <option value="">All restaurants</option>
        {restaurants.map((restaurant) => (
          <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
        ))}
      </FilterSelect>
      <FilterSelect label="Status" value={filters.status ?? ""} onChange={(value) => change({ status: (value || null) as OrderSearch["status"] })}>
        <option value="">Every status</option>
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </FilterSelect>
      <FilterSelect label="Payment" value={filters.payment} onChange={(value) => change({ payment: value as OrderSearch["payment"] })}>
        {PAYMENT_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </FilterSelect>
      <FilterSelect label="Source" value={filters.source ?? ""} onChange={(value) => change({ source: (value || null) as OrderSearch["source"] })}>
        <option value="">Every source</option>
        {SOURCE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </FilterSelect>
      <FilterSelect label="Slot" value={filters.slot ?? ""} onChange={(value) => change({ slot: (value || null) as OrderSearch["slot"] })}>
        <option value="">Every slot</option>
        {SLOT_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </FilterSelect>
    </div>
  );

  const rangeChip = (id: typeof shownRange, label: string, onClick: () => void) => (
    <button
      key={id}
      type="button"
      aria-pressed={shownRange === id}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3.5 text-sm font-semibold transition",
        FOCUS,
        shownRange === id ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <SectionCard bodyClassName="space-y-3">
        <div className="flex gap-2">
          <form
            role="search"
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              // Enter searches straight away instead of waiting out the debounce.
              event.preventDefault();
              const trimmed = text.trim();
              setSentSearch(trimmed);
              change({ search: trimmed }, "replace");
            }}
          >
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search orders by customer name, phone, tracking code or item"
              placeholder="Search name, phone, tracking code or item"
              className="pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
              value={text}
              maxLength={80}
              onChange={(event) => setText(event.target.value)}
            />
            {text ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setText("");
                  setSentSearch("");
                  change({ search: "" }, "replace");
                }}
                className={cn("absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900", FOCUS)}
              >
                <X size={15} />
              </button>
            ) : null}
          </form>
          <Button
            variant="outline"
            className={cn("shrink-0", FOCUS)}
            aria-expanded={panelOpen}
            aria-controls="order-filters"
            onClick={() => setPanelOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {activeChips.length > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neutral-950 px-1 text-xs font-bold text-white">{activeChips.length}</span>
            ) : null}
          </Button>
        </div>

        <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
          {rangeChip("today", "Today", () => pickRange(presets.today))}
          {rangeChip("yesterday", "Yesterday", () => pickRange(presets.yesterday))}
          {rangeChip("last7", "Last 7 days", () => pickRange(presets.last7))}
          {rangeChip("month", "This month", () => pickRange(presets.month))}
          {rangeChip("all", "All time", () => pickRange(null))}
          {rangeChip("custom", "Custom", () => setCustomOpen(true))}
        </div>

        {showCustom ? (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-neutral-500">
              From
              <Input className="mt-1 font-normal text-neutral-900" type="date" value={filters.dateFrom ?? ""} max={filters.dateTo ?? undefined} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="block text-xs font-bold text-neutral-500">
              To
              <Input className="mt-1 font-normal text-neutral-900" type="date" value={filters.dateTo ?? ""} min={filters.dateFrom ?? undefined} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        ) : null}

        {panelOpen ? (
          <div id="order-filters" className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
            {filterFields}
          </div>
        ) : null}

        {activeChips.length > 0 ? (
          <div role="group" aria-label="Active filters" className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <span key={chip.key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-xs font-semibold text-neutral-800">
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Remove filter: ${chip.label}`}
                  onClick={() => change(chip.remove)}
                  className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900", FOCUS)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" onClick={clearFilters} className={cn("rounded-md px-2 py-1 text-xs font-bold text-[#b65a20] hover:underline", FOCUS)}>
              Clear all
            </button>
          </div>
        ) : null}
      </SectionCard>

      <div className={cn("grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4", loading && "opacity-50")} aria-busy={loading}>
        <StatCard label="Orders" value={total} helper={hasNarrowing ? "Matching these filters" : "All orders"} />
        <StatCard label="Revenue" value={formatPaise(summary?.revenuePaise ?? 0)} helper={`${summary?.revenueOrders ?? 0} paid, not cancelled`} />
        <StatCard label="Average order" value={formatPaise(summary?.averagePaise ?? 0)} helper="Per paid, not cancelled order" />
        <div className="col-span-2 min-w-0 rounded-xl bg-white p-4 shadow-[0_10px_35px_rgba(30,32,38,0.05)] sm:p-5 lg:col-span-1">
          <p className="text-xs font-bold text-[#85878e] sm:text-sm">By status</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {summary
              ? STATUS_OPTIONS.filter(([status]) => status !== "AWAITING_CONFIRMATION" || summary.byStatus[status] > 0).map(([status, label]) => (
                  <Badge key={status} tone={summary.byStatus[status] > 0 ? statusTone(status) : "neutral"} className={cn("whitespace-nowrap tabular-nums", summary.byStatus[status] === 0 && "opacity-50")}>
                    {label} {summary.byStatus[status]}
                  </Badge>
                ))
              : "—"}
          </div>
        </div>
      </div>

      {loading ? (
        <OrderListSkeleton />
      ) : failed ? (
        <SectionCard>
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
            <AlertTriangle className="text-red-600" size={28} aria-hidden="true" />
            <p className="text-sm font-semibold text-neutral-900">{failure?.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFailure(null);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="Results"
          description={total === 0 ? "No orders" : `${total} order${total === 1 ? "" : "s"}, newest first`}
          bodyClassName="p-0"
          actions={
            <Button variant="outline" size="sm" className={FOCUS} disabled={exporting || total === 0} onClick={exportCsv}>
              {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
              Export CSV
            </Button>
          }
        >
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-neutral-500">
                {total > 0 ? "This page is past the last result." : hasNarrowing ? "No orders match this search." : "No orders have been placed yet."}
              </p>
              {total > 0 ? (
                <Button variant="outline" size="sm" onClick={() => go(orderListParams(filters, 1, pageSize))}>
                  Go to page 1
                </Button>
              ) : hasNarrowing ? (
                <Button variant="outline" size="sm" onClick={resetEverything}>
                  Reset search and filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/60 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                      <th scope="col" className="py-2.5 pl-5 pr-3">Order</th>
                      <th scope="col" className="py-2.5 pr-3">Customer</th>
                      <th scope="col" className="py-2.5 pr-3">Items</th>
                      <th scope="col" className="py-2.5 pr-3 text-right">Total</th>
                      <th scope="col" className="py-2.5 pr-5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <OrderTableRow key={order.id} order={order} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-neutral-100 sm:hidden">
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </ul>
            </>
          )}

          {total > 0 ? (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-100 p-4 sm:flex-row sm:p-5">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
                <p className="text-sm text-neutral-500" aria-live="polite">
                  Page {page} of {totalPages} · showing {firstShown}–{lastShown} of {total}
                </p>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-500">
                  Per page
                  <Select
                    className="h-9 w-20 font-normal text-neutral-900"
                    value={pageSize}
                    onChange={(event) => go(orderListParams(filters, 1, Number(event.target.value)))}
                  >
                    {PAGE_SIZE_CHOICES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className={FOCUS} disabled={page <= 1} onClick={() => go(orderListParams(filters, page - 1, pageSize))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className={FOCUS} disabled={page >= totalPages} onClick={() => go(orderListParams(filters, page + 1, pageSize))}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      )}
    </div>
  );
}

function OrderTableRow({ order }: { order: OrderListRow }) {
  const href = `/admin/orders/${order.trackingCode}`;
  const items = itemsSummary(order.items);
  return (
    // The tracking code is a real link stretched over the whole row, so the row opens the
    // order on click, keyboard and middle-click without any script.
    <tr className="relative border-b border-neutral-100 align-top transition last:border-0 hover:bg-neutral-50 focus-within:bg-amber-50/60">
      <td className="py-3 pl-5 pr-3">
        <Link href={href} prefetch={false} className="font-mono text-sm font-black outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-neutral-950">
          {order.trackingCode}
        </Link>
        <span className="mt-0.5 block whitespace-nowrap text-xs tabular-nums text-neutral-500">{formatIstFull(new Date(order.createdAt))}</span>
      </td>
      <td className="py-3 pr-3">
        <span className="block max-w-[10rem] truncate font-semibold xl:max-w-[14rem]" title={order.customerName}>{order.customerName}</span>
        <span className="block text-xs tabular-nums text-neutral-500">{order.customerPhone}</span>
        <CampusBadge campus={order.campus} className="mt-1" />
      </td>
      <td className="py-3 pr-3">
        <span className="block max-w-[11rem] truncate text-neutral-700 xl:max-w-[18rem]" title={items}>{items}</span>
        <span className="block max-w-[11rem] truncate text-xs text-neutral-500 xl:max-w-[18rem]">{order.restaurant.name}</span>
      </td>
      <td className="whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums">{formatPaiseExact(order.totalPaise)}</td>
      <td className="py-3 pr-5">
        <span className="flex max-w-[11rem] flex-wrap gap-1">
          <StatusBadge order={order} />
          <PaymentBadge order={order} />
          <SlotBadge slot={order.orderSlot} />
        </span>
      </td>
    </tr>
  );
}

function OrderCard({ order }: { order: OrderListRow }) {
  const items = itemsSummary(order.items);
  return (
    <li>
      <Link href={`/admin/orders/${order.trackingCode}`} prefetch={false} className={cn("block space-y-2 p-4 transition active:bg-neutral-50", FOCUS)}>
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-sm font-black">{order.trackingCode}</span>
          <span className="shrink-0 font-bold tabular-nums">{formatPaiseExact(order.totalPaise)}</span>
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold">{order.customerName}</span>
          <span className="block text-xs tabular-nums text-neutral-500">{order.customerPhone}</span>
        </span>
        <span className="line-clamp-2 block break-words text-sm text-neutral-700">{items}</span>
        <span className="block truncate text-xs text-neutral-500">{order.restaurant.name}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge order={order} />
          <PaymentBadge order={order} />
          <SlotBadge slot={order.orderSlot} />
          <CampusBadge campus={order.campus} />
        </span>
        <span className="block text-xs tabular-nums text-neutral-500">{formatIstFull(new Date(order.createdAt))}</span>
      </Link>
    </li>
  );
}
