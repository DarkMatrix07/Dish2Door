import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Regression for the September 2026 data exposure: the admin layout redirected
// signed-out visitors, but each page had already loaded its data and streamed it into
// the response. Every staff page and staff API handler must check the role itself,
// before anything else it awaits.

const ROOT = path.resolve(import.meta.dirname, "..");

function filesNamed(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesNamed(full, name));
    else if (entry === name) out.push(full);
  }
  return out;
}

// The text of each exported function body, up to its first `await`.
function firstAwaitPerHandler(source: string, exportPattern: RegExp) {
  const results: { name: string; firstAwait: string | null }[] = [];
  for (const match of source.matchAll(exportPattern)) {
    const rest = source.slice(match.index! + match[0].length);
    const awaitAt = rest.search(/\bawait\b/);
    const nextExport = rest.search(/\nexport\s/);
    const firstAwait = awaitAt === -1 || (nextExport !== -1 && nextExport < awaitAt) ? null : rest.slice(awaitAt, awaitAt + 120);
    results.push({ name: match[1] ?? "default", firstAwait });
  }
  return results;
}

test("every staff page checks the role before loading anything", () => {
  const pages = [
    ...filesNamed(path.join(ROOT, "app", "(admin)"), "page.tsx"),
    ...filesNamed(path.join(ROOT, "app", "(delivery)"), "page.tsx")
  ];
  assert.ok(pages.length > 20, "expected to find the admin pages");
  for (const file of pages) {
    const source = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const handlers = firstAwaitPerHandler(source, /export default (?:async )?function (\w*)/g);
    assert.equal(handlers.length, 1, `${rel}: expected one default export`);
    const [page] = handlers;
    if (page.firstAwait === null) {
      // A page that awaits nothing must load nothing: only a redirect is allowed.
      assert.match(source, /redirect\(/, `${rel}: awaits nothing and does not redirect`);
      assert.doesNotMatch(source, /prisma\./, `${rel}: reads the database without a role check`);
      continue;
    }
    assert.match(page.firstAwait, /^await requireRole\(/, `${rel}: the first await must be requireRole(...)`);
  }
});

test("every staff API handler checks the role before anything else", () => {
  const routes = [
    ...filesNamed(path.join(ROOT, "app", "api", "admin"), "route.ts"),
    ...filesNamed(path.join(ROOT, "app", "api", "delivery"), "route.ts")
  ];
  assert.ok(routes.length > 15, "expected to find the admin API routes");
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const handlers = firstAwaitPerHandler(source, /export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g);
    assert.ok(handlers.length > 0, `${rel}: no handlers found`);
    for (const handler of handlers) {
      assert.ok(handler.firstAwait, `${rel} ${handler.name}: awaits nothing`);
      assert.match(handler.firstAwait!, /^await requireApiRole\(/, `${rel} ${handler.name}: the first await must be requireApiRole(...)`);
    }
  }
});
