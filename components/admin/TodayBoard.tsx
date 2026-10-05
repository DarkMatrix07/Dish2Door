"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, Plus, Printer, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { BoardOrderRow } from "@/components/admin/BoardOrderRow";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { printPrepSheet } from "@/components/admin/print-prep-sheet";
import { Button, linkButtonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatIstTime } from "@/lib/ist-day";
import { slotLabel } from "@/lib/order-labels";
import type { SlotTimes } from "@/lib/order-slots";
import { prepSheetCount } from "@/lib/prep-sheet";
import {
  boardCampusOptions,
  boardViewToParams,
  bulkReachableCount,
  campusKeyOf,
  campusName,
  filterBoardOrders,
  formatPrepLine,
  groupBoard,
  lowerMeridiem,
  parseBoardView,
  scopeForSlot,
  slotKeyOf,
  type BoardView,
  type CampusGroup,
  type SlotGroup,
  type SlotKey,
  type TodayBoardData
} from "@/lib/today-board";
import { cn, formatPaise } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-1";
const POLL_MS = 30_000;
// Focus and visibilitychange both fire when a tab comes back; one refresh is enough.
const RETURN_REFRESH_GAP_MS = 2_000;

const CARD = "overflow-hidden rounded-xl bg-white shadow-[0_10px_35px_rgba(30,32,38,0.05)]";
const LIST = "divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const SLOT_TITLES: Record<SlotKey, string> = {
  AFTERNOON: "Afternoon",
  NIGHT: "Night",
  NONE: "No slot set"
};

function slotDeliverBy(slot: SlotKey, slotTimes: SlotTimes) {
  return slot === "NONE" ? "Placed without a delivery slot" : lowerMeridiem(slotTimes[slot].deliveryLabel);
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3.5 text-sm font-semibold transition",
        FOCUS,
        pressed ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}

type BulkTarget = { slot: SlotKey; campusId: string | null; campusLabel: string };

export function TodayBoard({
  initial,
  ordering,
  slotTimes
}: {
  initial: TodayBoardData;
  ordering: { openLabel: string; closeLabel: string; ordersOpen: boolean };
  // Read when the page loads; a slot time changed in Settings shows here after a refresh.
  slotTimes: SlotTimes;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Slot, campus and "show delivered" live in the URL, so a reload (or a shared link) keeps
  // the view. They are written with replaceState: switching a chip is not navigation, and
  // the back button should leave the board rather than step through chips.
  const view = useMemo(() => parseBoardView(searchParams), [searchParams]);
  const [search, setSearch] = useState(view.search);
  const term = search.trim();

  const writeView = useCallback(
    (next: BoardView) => {
      const text = boardViewToParams(next).toString();
      window.history.replaceState(null, "", text ? `${pathname}?${text}` : pathname);
    },
    [pathname]
  );
  const changeView = (patch: Partial<Omit<BoardView, "search">>) => writeView({ ...view, ...patch, search });

  // Search filters as you type; only the URL write is debounced.
  useEffect(() => {
    if (term === view.search) return;
    const timer = setTimeout(() => writeView({ ...view, search: term }), 300);
    return () => clearTimeout(timer);
  }, [term, view, writeView]);

  // ---- data + refresh -------------------------------------------------------------
  const [data, setData] = useState(initial);
  const [nowMs, setNowMs] = useState(() => new Date(initial.generatedAt).getTime());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const lastStartRef = useRef(0);

  // Only the newest request may update the screen, so a slow poll that started before an
  // action can never overwrite the fresher list that followed it.
  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const mine = ++sequenceRef.current;
    lastStartRef.current = Date.now();
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/orders/today", { signal: controller.signal, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Your session has expired. Sign in again." : body.error ?? "Could not load orders");
      }
      if (mine !== sequenceRef.current) return;
      setData(body as TodayBoardData);
      setNowMs(Date.now());
      setError(null);
    } catch (failure) {
      if (controller.signal.aborted || mine !== sequenceRef.current) return;
      setError(failure instanceof Error ? failure.message : "Could not load orders");
    } finally {
      if (mine === sequenceRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // A hidden tab does not poll: nobody is looking, and the phone is spared the traffic.
    const tick = () => {
      setNowMs(Date.now());
      if (!document.hidden) void refresh();
    };
    const onReturn = () => {
      if (!document.hidden && Date.now() - lastStartRef.current > RETURN_REFRESH_GAP_MS) void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  // ---- derived lists --------------------------------------------------------------
  const { orders, openEarlier, summary } = data;
  const live = useMemo(() => orders.filter((order) => order.status !== "CANCELLED"), [orders]);
  const cancelled = useMemo(() => orders.filter((order) => order.status === "CANCELLED"), [orders]);

  const filtered = useMemo(
    () => filterBoardOrders(live, { slot: view.slot, campus: view.campus, search: term }),
    [live, view.slot, view.campus, term]
  );
  const filteredCancelled = useMemo(
    () => filterBoardOrders(cancelled, { slot: view.slot, campus: view.campus, search: term }),
    [cancelled, view.slot, view.campus, term]
  );
  const groups = useMemo(() => groupBoard(filtered, view.showDelivered), [filtered, view.showDelivered]);

  // Tab and chip counts respect the other filters (and the search) but not their own, so
  // each shows how many orders that choice would leave.
  const slotCounts = useMemo(() => {
    const scoped = filterBoardOrders(live, { slot: null, campus: view.campus, search: term });
    const counts: Record<SlotKey, number> = { AFTERNOON: 0, NIGHT: 0, NONE: 0 };
    for (const order of scoped) counts[slotKeyOf(order)]++;
    return { all: scoped.length, ...counts };
  }, [live, view.campus, term]);
  const campusOptions = useMemo(() => boardCampusOptions(orders), [orders]);
  const campusCounts = useMemo(() => {
    const scoped = filterBoardOrders(live, { slot: view.slot, campus: null, search: term });
    const counts = new Map<string, number>();
    for (const order of scoped) counts.set(campusKeyOf(order), (counts.get(campusKeyOf(order)) ?? 0) + 1);
    return { all: scoped.length, counts };
  }, [live, view.slot, term]);
  const deliveredCount = useMemo(() => filtered.filter((order) => order.status === "DELIVERED").length, [filtered]);

  const filtersActive = view.slot !== null || view.campus !== null || term !== "";
  const afternoonSheet = prepSheetCount(orders, "AFTERNOON");
  const nightSheet = prepSheetCount(orders, "NIGHT");

  function clearFilters() {
    setSearch("");
    writeView({ ...view, slot: null, campus: null, search: "" });
  }

  // ---- bulk "reached campus" ------------------------------------------------------
  const [bulk, setBulk] = useState<BulkTarget | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkInFlight = useRef(false);
  // Recounted on every refresh, so the dialog never states a stale number.
  const bulkCount = bulk ? bulkReachableCount(orders, bulk.slot, bulk.campusId) : 0;

  const closeBulk = useCallback(() => {
    if (!bulkInFlight.current) setBulk(null);
  }, []);

  async function confirmBulk() {
    if (!bulk || bulkInFlight.current) return;
    bulkInFlight.current = true;
    setBulkBusy(true);
    try {
      const response = await fetch("/api/admin/orders/reached-campus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId: bulk.campusId, slot: scopeForSlot(bulk.slot) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not mark the orders reached");
      const count = Number(result.count) || 0;
      if (count > 0) toast.success(`${plural(count, "order")} marked reached campus`);
      else toast.info("Nothing to mark: those orders had already moved on");
      setBulk(null);
      void refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not mark the orders reached");
    } finally {
      bulkInFlight.current = false;
      setBulkBusy(false);
    }
  }

  // ---- render ---------------------------------------------------------------------
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const updatedAt = formatIstTime(new Date(data.generatedAt));
  const unpaidHref = `/admin/orders/all?payment=unpaid&dateFrom=${data.dayKey}&dateTo=${data.dayKey}`;
  const openEarlierHidden = data.openEarlierTotal - openEarlier.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <AdminPageHeader
        eyebrow="Orders"
        title="Today's orders"
        description={`${data.dayLabel}. Hand orders over campus by campus, slot by slot.`}
      >
        {/* Two equal columns on phones (sheets on top, links below) so no label ever wraps. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button variant="outline" className={cn("min-w-0 gap-1.5 whitespace-nowrap px-3 text-sm", FOCUS)} disabled={afternoonSheet === 0} onClick={() => printPrepSheet(orders, "AFTERNOON", data.dayLabel)}>
            <Printer size={16} className="shrink-0" aria-hidden="true" />
            <span className="sr-only">Print </span>Afternoon sheet
          </Button>
          <Button variant="outline" className={cn("min-w-0 gap-1.5 whitespace-nowrap px-3 text-sm", FOCUS)} disabled={nightSheet === 0} onClick={() => printPrepSheet(orders, "NIGHT", data.dayLabel)}>
            <Printer size={16} className="shrink-0" aria-hidden="true" />
            <span className="sr-only">Print </span>Night sheet
          </Button>
          <Link href="/admin/orders/all" className={cn(linkButtonClasses("outline"), "min-w-0 whitespace-nowrap", FOCUS)}>
            All orders
          </Link>
          <Link href="/admin/orders/new" className={cn(linkButtonClasses("default"), "min-w-0 whitespace-nowrap", FOCUS)}>
            <Plus size={16} className="shrink-0" aria-hidden="true" />
            New order
          </Link>
        </div>
      </AdminPageHeader>

      {error ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Could not refresh: {error} Showing the list from {updatedAt}.
          </p>
          <Button variant="outline" size="sm" className={FOCUS} disabled={refreshing} onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      ) : null}

      {openEarlier.length > 0 ? (
        // Never filtered or hidden: these are paid orders somebody still owes a handover.
        <section aria-labelledby="open-earlier-heading" className="overflow-hidden rounded-xl border-2 border-amber-400 bg-amber-50">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={22} aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="open-earlier-heading" className="text-base font-black text-amber-950 sm:text-lg">
                {plural(data.openEarlierTotal, "order")} still open from earlier days
              </h2>
              <p className="mt-1 text-sm leading-5 text-amber-900">
                Paid, but never marked delivered or cancelled. Close each as delivered that day (no message is sent to the customer) or cancel it.
              </p>
            </div>
          </div>
          <ul className={cn(LIST, "mx-3 mb-3 sm:mx-4 sm:mb-4")}>
            {openEarlier.map((order) => (
              <BoardOrderRow key={order.id} order={order} nowMs={nowMs} onChanged={refresh} loose earlier />
            ))}
          </ul>
          {openEarlierHidden > 0 ? (
            <p className="px-4 pb-4 text-sm font-semibold text-amber-900 sm:px-5">
              Showing the oldest {openEarlier.length}. {plural(openEarlierHidden, "more order")} {openEarlierHidden === 1 ? "is" : "are"} still open; handle these to see the rest.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Today's totals">
        <StatCard label="To prepare" value={summary.toPrepare} helper="Confirmed" />
        <StatCard label="Reached campus" value={summary.reached} helper="Waiting for handover" />
        <StatCard label="Delivered" value={summary.delivered} />
        <StatCard label="Cancelled today" value={summary.cancelled} />
        <StatCard label="Today's revenue" value={formatPaise(summary.revenuePaise)} helper="Paid, not cancelled · Domino's not included" />
        <StatCard label="Total active" value={summary.active} helper="Confirmed + reached" />
      </div>

      {data.unpaidCheckouts > 0 || data.dominosOrders > 0 ? (
        <p className="flex flex-col gap-1 text-sm text-neutral-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {data.unpaidCheckouts > 0 ? (
            <Link href={unpaidHref} className={cn("rounded font-semibold underline-offset-2 hover:underline", FOCUS)}>
              {plural(data.unpaidCheckouts, "unpaid checkout")} today → view
            </Link>
          ) : null}
          {data.dominosOrders > 0 ? (
            <span>
              Domino&apos;s: {plural(data.dominosOrders, "order")} today →{" "}
              <Link href="/admin/pizza/today" className={cn("rounded font-semibold underline-offset-2 hover:underline", FOCUS)}>
                Domino&apos;s orders
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}

      <SectionCard bodyClassName="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1" role="search">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search today's orders by customer name, phone, tracking code or item"
              placeholder="Search name, phone, code or item"
              className="pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className={cn("absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900", FOCUS)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <Button variant="outline" className={cn("shrink-0", FOCUS)} disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <div role="group" aria-label="Delivery slot" className="flex flex-wrap gap-2">
          <Chip pressed={view.slot === null} onClick={() => changeView({ slot: null })}>
            All ({slotCounts.all})
          </Chip>
          <Chip pressed={view.slot === "AFTERNOON"} onClick={() => changeView({ slot: "AFTERNOON" })}>
            Afternoon ({slotCounts.AFTERNOON})
          </Chip>
          <Chip pressed={view.slot === "NIGHT"} onClick={() => changeView({ slot: "NIGHT" })}>
            Night ({slotCounts.NIGHT})
          </Chip>
          {slotCounts.NONE > 0 || view.slot === "NONE" ? (
            <Chip pressed={view.slot === "NONE"} onClick={() => changeView({ slot: "NONE" })}>
              No slot ({slotCounts.NONE})
            </Chip>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {campusOptions.length > 1 || view.campus ? (
            <div role="group" aria-label="Campus" className="flex flex-wrap gap-2">
              <Chip pressed={view.campus === null} onClick={() => changeView({ campus: null })}>
                All campuses
              </Chip>
              {campusOptions.map(({ key, campus }) => (
                <Chip key={key} pressed={view.campus === key} onClick={() => changeView({ campus: key })}>
                  {campusName(campus)} ({campusCounts.counts.get(key) ?? 0})
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="sm:ml-auto">
            <Chip pressed={view.showDelivered} onClick={() => changeView({ showDelivered: !view.showDelivered })}>
              Show delivered ({deliveredCount})
            </Chip>
          </div>
        </div>

        <p className="text-xs text-neutral-500">Updated {updatedAt} · refreshes every 30 seconds</p>
      </SectionCard>

      {orders.length === 0 ? (
        <SectionCard>
          <div className="px-4 py-10 text-center">
            <p className="text-base font-bold text-neutral-900">No orders yet today</p>
            <p className="mt-1 text-sm text-neutral-500">
              {ordering.ordersOpen
                ? `Ordering is open from ${lowerMeridiem(ordering.openLabel)} to ${lowerMeridiem(ordering.closeLabel)}. New orders appear here on their own.`
                : "Public ordering is switched off right now. Turn it on from the dashboard to take orders."}
            </p>
          </div>
        </SectionCard>
      ) : groups.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-neutral-600">
              {filtersActive ? "No orders match these filters." : "Nothing to hand over: every order today was cancelled."}
            </p>
            {filtersActive ? (
              <Button variant="outline" size="sm" className={FOCUS} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {groups.map((group) => (
            <SlotSection
              slotTimes={slotTimes}
              key={group.key}
              group={group}
              orders={orders}
              nowMs={nowMs}
              searching={term !== ""}
              onChanged={refresh}
              onBulk={setBulk}
            />
          ))}
        </div>
      )}

      {filteredCancelled.length > 0 ? (
        <section className={CARD}>
          <h2>
            <button
              type="button"
              aria-expanded={cancelledOpen}
              aria-controls="cancelled-orders"
              onClick={() => setCancelledOpen((open) => !open)}
              className={cn("flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5", FOCUS)}
            >
              <span className="text-base font-black tracking-[-0.02em] sm:text-lg">Cancelled today ({filteredCancelled.length})</span>
              <ChevronDown size={18} className={cn("shrink-0 text-neutral-500 transition-transform", cancelledOpen && "rotate-180")} aria-hidden="true" />
            </button>
          </h2>
          {cancelledOpen ? (
            <ul id="cancelled-orders" className="divide-y divide-neutral-100 border-t border-neutral-100">
              {filteredCancelled
                .slice()
                .reverse()
                .map((order) => (
                  <BoardOrderRow key={order.id} order={order} nowMs={nowMs} onChanged={refresh} loose />
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={bulk !== null}
        onClose={closeBulk}
        title={bulkCount > 0 ? `Mark ${plural(bulkCount, "order")} reached campus?` : "Nothing left to mark"}
        description="Only orders placed today are included."
        footer={
          <>
            <Button variant="outline" size="sm" className={FOCUS} disabled={bulkBusy} onClick={closeBulk}>
              Cancel
            </Button>
            <Button size="sm" className={FOCUS} disabled={bulkBusy || bulkCount === 0} onClick={() => void confirmBulk()}>
              {bulkBusy ? "Working..." : `Mark ${bulkCount} reached`}
            </Button>
          </>
        }
      >
        {bulk ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-neutral-500">Campus</dt>
              <dd className="font-semibold">{bulk.campusLabel}</dd>
              <dt className="text-neutral-500">Slot</dt>
              <dd className="font-semibold">
                {slotLabel(scopeForSlot(bulk.slot))}
                {bulk.slot === "NONE" ? "" : ` · ${lowerMeridiem(slotTimes[bulk.slot].deliveryLabel)}`}
              </dd>
              <dt className="text-neutral-500">Orders</dt>
              <dd className="font-semibold tabular-nums">{bulkCount} confirmed</dd>
            </dl>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              {bulkCount > 0
                ? `Each of these ${plural(bulkCount, "customer")} will be sent a "reached campus" message. This cannot be undone.`
                : "Every order in this group has already been moved on. Close this and refresh the board."}
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

function SlotSection({
  group,
  slotTimes,
  orders,
  nowMs,
  searching,
  onChanged,
  onBulk
}: {
  group: SlotGroup;
  slotTimes: SlotTimes;
  orders: TodayBoardData["orders"];
  nowMs: number;
  searching: boolean;
  onChanged: () => void;
  onBulk: (target: BulkTarget) => void;
}) {
  const headingId = `slot-${group.key}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id={headingId} className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
          {SLOT_TITLES[group.key]}
        </h2>
        <p className="text-sm text-neutral-500">
          {slotDeliverBy(group.key, slotTimes)} · {plural(group.total, "order")}
        </p>
      </div>
      <div className="space-y-4">
        {group.campuses.map((campusGroup) => (
          <CampusSection
            key={campusGroup.key}
            slot={group.key}
            group={campusGroup}
            orders={orders}
            nowMs={nowMs}
            searching={searching}
            onChanged={onChanged}
            onBulk={onBulk}
          />
        ))}
      </div>
    </section>
  );
}

function CampusSection({
  slot,
  group,
  orders,
  nowMs,
  searching,
  onChanged,
  onBulk
}: {
  slot: SlotKey;
  group: CampusGroup;
  orders: TodayBoardData["orders"];
  nowMs: number;
  searching: boolean;
  onChanged: () => void;
  onBulk: (target: BulkTarget) => void;
}) {
  const campusId = group.campus?.id ?? null;
  // Counted from all of today's orders in this slot and campus, never from a search
  // result: the bulk action moves the whole group, so it is only offered with the whole
  // group in view.
  const reachable = bulkReachableCount(orders, slot, campusId);
  const label = campusName(group.campus);

  return (
    <div className={CARD}>
      <div className="flex flex-col gap-3 border-b border-neutral-100 bg-neutral-50/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <CampusBadge campus={group.campus} className="px-2.5 py-1 text-xs" />
          <p className="flex flex-wrap gap-x-3 text-xs font-semibold tabular-nums text-neutral-600">
            <span>{group.counts.toPrepare} to prepare</span>
            <span>{group.counts.reached} reached</span>
            <span>{group.counts.delivered} delivered</span>
          </p>
        </div>
        {reachable > 0 ? (
          searching ? (
            <p className="text-xs text-neutral-500">Clear the search to mark this whole campus reached.</p>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className={cn("w-full sm:w-auto", FOCUS)}
              aria-label={`Mark ${reachable} ${label} ${SLOT_TITLES[slot]} orders reached campus`}
              onClick={() => onBulk({ slot, campusId, campusLabel: label })}
            >
              Mark {reachable} reached
            </Button>
          )
        ) : null}
      </div>

      <div className="space-y-5 p-3 sm:p-4">
        {group.restaurants.map((restaurant) => (
          <div key={restaurant.key}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-black uppercase tracking-wide text-neutral-800">{restaurant.name}</h3>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-neutral-600">
                {restaurant.counts.toPrepare + restaurant.counts.reached + restaurant.counts.delivered}
              </span>
            </div>
            {restaurant.prep.length > 0 ? (
              <p className="mt-1 text-sm text-neutral-700">
                <span className="font-semibold">To prepare:</span> {formatPrepLine(restaurant.prep)}
              </p>
            ) : null}
            {restaurant.orders.length > 0 ? (
              <ul className={cn(LIST, "mt-2")} aria-label={`${restaurant.name} orders`}>
                {restaurant.orders.map((order) => (
                  <BoardOrderRow key={order.id} order={order} nowMs={nowMs} onChanged={onChanged} />
                ))}
              </ul>
            ) : null}
            {restaurant.hiddenDelivered > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">{plural(restaurant.hiddenDelivered, "delivered order")} hidden</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
