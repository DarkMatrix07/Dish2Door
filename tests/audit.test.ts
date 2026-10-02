import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_ACTIONS,
  AUDIT_DETAIL_MAX,
  AUDIT_GROUPS,
  actionsInGroup,
  auditActionGroup,
  auditActionLabel,
  bpsPercent,
  buildAuditRow,
  clampDetail,
  describeChanges,
  minuteOfDayLabel,
  plural,
  rupees,
  safeRecord,
  shortList,
  summariseChanges,
  type AuditAction,
  type AuditRow
} from "../lib/audit-actions";
import {
  AUDIT_PAGE_SIZE,
  UNKNOWN_WHO,
  auditParamsFromRecord,
  auditRangeStart,
  auditSearchToParams,
  auditTargetLink,
  buildAuditWhere,
  parseAuditSearch
} from "../lib/audit-search";

const params = (record: Record<string, string>) => new URLSearchParams(record);

// ---- The action list ----

test("every action has a plain-English label and belongs to one of the five groups", () => {
  for (const [action, meta] of Object.entries(AUDIT_ACTIONS)) {
    assert.ok(meta.label.length > 3, `${action} has a label`);
    assert.ok(AUDIT_GROUPS.includes(meta.group), `${action} is in a known group`);
  }
  const grouped = AUDIT_GROUPS.flatMap((group) => actionsInGroup(group));
  assert.equal(new Set(grouped).size, Object.keys(AUDIT_ACTIONS).length);
});

test("the actions named in the brief exist and sit in the right filter group", () => {
  const expected: Record<string, string> = {
    "menu.item.price": "menu",
    "menu.item.discount.bulk": "menu",
    "menu.item.stock": "menu",
    "menu.restaurant.delete": "menu",
    "coupon.create": "coupons",
    "coupon.update": "coupons",
    "coupon.delete": "coupons",
    "wheel.gift": "coupons",
    "wheel.cancel": "coupons",
    "order.cancel": "orders",
    "order.status": "orders",
    "order.close_quietly": "orders",
    "order.reached_bulk": "orders",
    "settings.update": "settings",
    "settings.orders_open": "settings",
    "campus.update": "settings",
    "staff.login": "signins"
  };
  for (const [action, group] of Object.entries(expected)) assert.equal(auditActionGroup(action), group, action);
});

test("an action this page does not know is shown as stored, not hidden", () => {
  assert.equal(auditActionLabel("menu.item.price"), "Changed an item's price");
  assert.equal(auditActionLabel("something.new"), "something.new");
  assert.equal(auditActionGroup("something.new"), null);
});

// ---- Writing a row ----

test("a row is trimmed and capped, and outcome defaults to ok", () => {
  const long = "x".repeat(AUDIT_DETAIL_MAX + 500);
  const row = buildAuditRow({ actorId: "u1", action: "coupon.create", targetType: "coupon", targetId: "c1", detail: `  ${long}  ` });
  assert.equal(row.detail?.length, AUDIT_DETAIL_MAX);
  assert.ok(row.detail?.endsWith("…"));
  assert.equal(row.outcome, "ok");
  assert.equal(row.targetType, "coupon");
  assert.equal(clampDetail("   "), null);
  assert.equal(clampDetail(undefined), null);
  assert.equal(buildAuditRow({ actorId: null, action: "staff.login", targetType: "user" }).targetId, null);
  assert.equal(buildAuditRow({ actorId: null, action: "staff.login", targetType: "user", targetId: "y".repeat(500) }).targetId?.length, 200);
});

test("recording hands the row to the writer", async () => {
  const written: AuditRow[] = [];
  await safeRecord(async (row) => void written.push(row), { actorId: "u1", action: "order.cancel", targetType: "order", targetId: "ABC123", detail: "Order ABC123 cancelled" });
  assert.equal(written.length, 1);
  assert.deepEqual(written[0], { actorId: "u1", action: "order.cancel", targetType: "order", targetId: "ABC123", outcome: "ok", detail: "Order ABC123 cancelled" });
});

test("a failing write never throws into the caller", async () => {
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await assert.doesNotReject(safeRecord(async () => { throw new Error("database is down"); }, { actorId: "u1", action: "coupon.create", targetType: "coupon" }));
    // Even a writer that throws before returning a promise.
    await assert.doesNotReject(safeRecord((() => { throw new Error("sync failure"); }) as never, { actorId: null, action: "staff.login", targetType: "user" }));
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 2);
  assert.match(String(logged[0][1]), /coupon\.create/);
});

// ---- Wording ----

test("money, percent and time read the way the owner says them", () => {
  assert.equal(rupees(18900), "₹189");
  assert.equal(rupees(19950), "₹199.50");
  assert.equal(rupees(125000), "₹1,250");
  assert.equal(bpsPercent(250), "2.5%");
  assert.equal(minuteOfDayLabel(0), "12:00 am");
  assert.equal(minuteOfDayLabel(540), "9:00 am");
  assert.equal(minuteOfDayLabel(720), "12:00 pm");
  assert.equal(minuteOfDayLabel(1275), "9:15 pm");
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(3, "order"), "3 orders");
});

test("a bulk list is capped with a count of the rest", () => {
  assert.equal(shortList(["A", "B"]), "A, B");
  assert.equal(shortList(["A", "B", "C", "D", "E"]), "A, B, C, D, E");
  assert.equal(shortList(["A", "B", "C", "D", "E", "F", "G"]), "A, B, C, D, E and 2 more");
  assert.equal(shortList([" ", "A"]), "A");
});

test("a price change reads as before → after, and only what moved is listed", () => {
  const specs = [
    { key: "pricePaise", label: "price", kind: "money" },
    { key: "discountPercent", label: "discount", kind: "percent" },
    { key: "name", label: "name", kind: "text" },
    { key: "description", label: "description", kind: "changed" }
  ] as const;
  const before = { pricePaise: 18900, discountPercent: 0, name: "Paneer Tikka", description: "old" };
  const after = { pricePaise: 19900, discountPercent: 0, name: "Paneer Tikka", description: "old" };
  assert.deepEqual(describeChanges(before, after, specs), ["price ₹189 → ₹199"]);
  assert.equal(summariseChanges("Paneer Tikka", describeChanges(before, after, specs)), "Paneer Tikka: price ₹189 → ₹199");
  const several = describeChanges(before, { ...after, discountPercent: 10, name: "Paneer Tikka Large", description: "new" }, specs);
  assert.deepEqual(several, ["price ₹189 → ₹199", "discount 0% → 10%", 'name "Paneer Tikka" → "Paneer Tikka Large"', "description changed"]);
});

test("no change means no row, and fields left out of an update are ignored", () => {
  const specs = [{ key: "platformFeePaise", label: "platform fee", kind: "money" }, { key: "active", label: "switched on", kind: "bool" }] as const;
  assert.deepEqual(describeChanges({ platformFeePaise: 500, active: true }, { platformFeePaise: 500 }, specs), []);
  assert.equal(summariseChanges("VIT-AP", []), null);
  // `active` was not sent, so its absence is not a change.
  assert.deepEqual(describeChanges({ platformFeePaise: 500, active: true }, { platformFeePaise: 600 }, specs), ["platform fee ₹5 → ₹6"]);
});

test("empty values get a friendly name and booleans read yes/no", () => {
  const specs = [
    { key: "maxUses", label: "uses allowed", kind: "number", empty: "no limit" },
    { key: "open", label: "taking orders", kind: "bool" },
    { key: "close", label: "closing time", kind: "minute" },
    { key: "fee", label: "payment charge", kind: "bps" }
  ] as const;
  assert.deepEqual(
    describeChanges({ maxUses: null, open: true, close: 1260, fee: 200 }, { maxUses: 50, open: false, close: 1320, fee: 250 }, specs),
    ["uses allowed no limit → 50", "taking orders yes → no", "closing time 9:00 pm → 10:00 pm", "payment charge 2% → 2.5%"]
  );
  assert.deepEqual(describeChanges({ maxUses: 50 }, { maxUses: null }, [specs[0]]), ["uses allowed 50 → no limit"]);
  // null, undefined and "" all mean "not set", so none of them is a change from another.
  assert.deepEqual(describeChanges({ sizeLabel: null }, { sizeLabel: "" }, [{ key: "sizeLabel", label: "size", kind: "text" }]), []);
});

test("with no earlier values the row says what was set", () => {
  assert.deepEqual(describeChanges(null, { pricePaise: 9900 }, [{ key: "pricePaise", label: "price", kind: "money" }]), ["price set to ₹99"]);
});

// ---- Filters ----

test("filters are allow-listed and defaults stay out of the address", () => {
  const search = parseAuditSearch(params({ who: "ckabc123", group: "menu", range: "7d", q: "  paneer  " }));
  assert.deepEqual(search, { who: "ckabc123", group: "menu", range: "7d", q: "paneer" });
  assert.deepEqual(auditSearchToParams(search), { who: "ckabc123", group: "menu", range: "7d", q: "paneer" });
  assert.deepEqual(auditSearchToParams(parseAuditSearch(params({}))), {});

  const hostile = parseAuditSearch(params({ who: "x'; DROP TABLE", group: "everything", range: "forever", q: "y".repeat(500) }));
  assert.equal(hostile.who, null);
  assert.equal(hostile.group, null);
  assert.equal(hostile.range, "all");
  assert.equal(hostile.q.length, 80);
});

test("a repeated parameter uses its first value", () => {
  assert.equal(auditParamsFromRecord({ group: ["orders", "menu"], range: undefined }).get("group"), "orders");
  assert.equal(auditParamsFromRecord({ range: undefined }).has("range"), false);
});

test("date presets start on an India day boundary and count today as one day", () => {
  // 3 Oct 2026, 1:00 am IST is still 2 Oct in UTC.
  const now = new Date("2026-10-02T19:30:00Z");
  assert.equal(auditRangeStart("all", now), null);
  assert.equal(auditRangeStart("today", now)?.toISOString(), "2026-10-02T18:30:00.000Z");
  assert.equal(auditRangeStart("7d", now)?.toISOString(), "2026-09-26T18:30:00.000Z");
  assert.equal(auditRangeStart("30d", now)?.toISOString(), "2026-09-03T18:30:00.000Z");
});

test("the query combines who, group, date and text with AND", () => {
  assert.deepEqual(buildAuditWhere(parseAuditSearch(params({}))), {});
  const now = new Date("2026-10-02T09:00:00Z");
  const where = buildAuditWhere(parseAuditSearch(params({ who: "u1", group: "signins", range: "today", q: "ABC123" })), now);
  assert.deepEqual(where, {
    AND: [
      { actorId: "u1" },
      { action: { in: ["staff.login"] } },
      { createdAt: { gte: new Date("2026-10-01T18:30:00.000Z") } },
      { OR: [{ detail: { contains: "ABC123", mode: "insensitive" } }, { targetId: { contains: "ABC123", mode: "insensitive" } }] }
    ]
  });
});

test("'unknown' finds sign-ins that matched no account", () => {
  assert.deepEqual(buildAuditWhere(parseAuditSearch(params({ who: UNKNOWN_WHO }))), { AND: [{ actorId: null }] });
});

test("a group filter covers every action in that group", () => {
  const where = buildAuditWhere(parseAuditSearch(params({ group: "orders" }))) as { AND: { action: { in: AuditAction[] } }[] };
  assert.deepEqual([...where.AND[0].action.in].sort(), (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((a) => a.startsWith("order.")).sort());
});

test("the page shows 30 rows at a time", () => {
  assert.equal(AUDIT_PAGE_SIZE, 30);
});

// ---- Links ----

test("targets link to the page that shows them", () => {
  assert.deepEqual(auditTargetLink("order.cancel", "order", "ABC12345"), { href: "/admin/orders/ABC12345", label: "Open order" });
  assert.deepEqual(auditTargetLink("wheel.gift", "customer", "9876543210"), { href: "/admin/customers/9876543210", label: "Open customer" });
  assert.equal(auditTargetLink("menu.item.price", "restaurant", "ckrest1")?.href, "/admin/menu/items?restaurant=ckrest1");
  assert.equal(auditTargetLink("shop.update", "shop", "ckpizza")?.href, "/admin/pizza");
  assert.equal(auditTargetLink("coupon.update", "coupon", "ckc1")?.href, "/admin/offers/coupons");
  assert.equal(auditTargetLink("settings.update", "settings", "default")?.href, "/admin/settings");
  assert.equal(auditTargetLink("campus.update", "campus", "vit_ap")?.href, "/admin/settings");
});

test("rows with nothing to open get no link", () => {
  assert.equal(auditTargetLink("order.reached_bulk", "order", null), null);
  assert.equal(auditTargetLink("menu.restaurant.delete", "restaurant", "ckrest1"), null);
  assert.equal(auditTargetLink("coupon.delete", "coupon", "ckc1"), null);
  assert.equal(auditTargetLink("staff.login", "user", "u1"), null);
  assert.equal(auditTargetLink("menu.image.upload", "upload", "/uploads/menu/a.webp"), null);
  // A target that does not look like a real code or phone is never turned into a link.
  assert.equal(auditTargetLink("order.cancel", "order", "../../etc"), null);
  assert.equal(auditTargetLink("wheel.gift", "customer", "not-a-phone"), null);
  assert.equal(auditTargetLink("menu.item.price", "restaurant", "a/b?x=1"), null);
});
