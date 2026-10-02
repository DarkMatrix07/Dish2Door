import assert from "node:assert/strict";
import test from "node:test";
import { csrfDecision, isCsrfExemptPath, type CsrfInput } from "../lib/csrf";

function post(overrides: Partial<CsrfInput> = {}): CsrfInput {
  return {
    method: "POST",
    pathname: "/api/admin/settings",
    origin: "https://dish2door.example",
    secFetchSite: "same-origin",
    host: "dish2door.example",
    ...overrides
  };
}

test("safe methods always pass, even cross-site", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(csrfDecision(post({ method, origin: "https://evil.example", secFetchSite: "cross-site" })).allowed, true);
  }
});

test("state-changing methods from our own origin pass", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(csrfDecision(post({ method })).allowed, true);
  }
});

test("a different origin is rejected for every state-changing method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const decision = csrfDecision(post({ method, origin: "https://evil.example" }));
    assert.deepEqual(decision, { allowed: false, reason: "origin-mismatch" });
  }
});

test("the Origin header wins over Sec-Fetch-Site", () => {
  assert.equal(csrfDecision(post({ origin: "https://evil.example", secFetchSite: "same-origin" })).allowed, false);
  assert.equal(csrfDecision(post({ origin: "https://dish2door.example", secFetchSite: "cross-site" })).allowed, true);
});

test("host comparison includes the port and ignores case", () => {
  assert.equal(csrfDecision(post({ origin: "http://localhost:3000", host: "localhost:3000" })).allowed, true);
  assert.equal(csrfDecision(post({ origin: "http://localhost:4000", host: "localhost:3000" })).allowed, false);
  assert.equal(csrfDecision(post({ origin: "https://Dish2Door.Example", host: "DISH2DOOR.example" })).allowed, true);
});

test("an explicit default port on the Host header still matches the bare Origin host", () => {
  assert.equal(csrfDecision(post({ host: "dish2door.example:443" })).allowed, true);
});

test("look-alike hosts are rejected", () => {
  assert.equal(csrfDecision(post({ origin: "https://dish2door.example.evil.example" })).allowed, false);
  assert.equal(csrfDecision(post({ origin: "https://evil-dish2door.example" })).allowed, false);
  assert.equal(csrfDecision(post({ origin: "https://dish2door.example@evil.example" })).allowed, false);
});

test("unparseable and null origins are rejected", () => {
  assert.deepEqual(csrfDecision(post({ origin: "null" })), { allowed: false, reason: "origin-unparseable" });
  assert.equal(csrfDecision(post({ origin: "not a url" })).allowed, false);
});

test("an Origin with no Host header cannot be matched and is rejected", () => {
  assert.equal(csrfDecision(post({ host: null })).allowed, false);
});

test("x-forwarded-host is only honoured when the proxy is trusted", () => {
  const forwarded = { host: "127.0.0.1:3000", forwardedHost: "dish2door.example" };
  assert.equal(csrfDecision(post({ ...forwarded, trustProxy: false })).allowed, false);
  assert.equal(csrfDecision(post({ ...forwarded })).allowed, false);
  assert.equal(csrfDecision(post({ ...forwarded, trustProxy: true })).allowed, true);
  // A trusted forwarded host does not make unrelated origins pass.
  assert.equal(csrfDecision(post({ ...forwarded, trustProxy: true, origin: "https://evil.example" })).allowed, false);
});

test("without Origin, Sec-Fetch-Site decides", () => {
  assert.equal(csrfDecision(post({ origin: null, secFetchSite: "same-origin" })).allowed, true);
  assert.equal(csrfDecision(post({ origin: null, secFetchSite: "none" })).allowed, true);
  assert.deepEqual(csrfDecision(post({ origin: null, secFetchSite: "cross-site" })), { allowed: false, reason: "fetch-site-cross" });
  assert.equal(csrfDecision(post({ origin: null, secFetchSite: "same-site" })).allowed, false);
  assert.equal(csrfDecision(post({ origin: "", secFetchSite: "cross-site" })).allowed, false);
});

test("with neither header (not a browser) the request passes", () => {
  assert.equal(csrfDecision(post({ origin: null, secFetchSite: null })).allowed, true);
});

test("payment webhooks are exempt from the check", () => {
  const webhook = post({ pathname: "/api/webhooks/razorpay", origin: null, secFetchSite: "cross-site" });
  assert.equal(csrfDecision(webhook).allowed, true);
  assert.equal(csrfDecision({ ...webhook, origin: "https://evil.example" }).allowed, true);
});

test("the exemption is an exact path prefix, not a substring", () => {
  assert.equal(isCsrfExemptPath("/api/webhooks/razorpay"), true);
  assert.equal(isCsrfExemptPath("/api/webhooks"), false);
  assert.equal(isCsrfExemptPath("/api/admin/webhooks/x"), false);
  assert.equal(isCsrfExemptPath("/api/webhooksx/razorpay"), false);
  assert.equal(csrfDecision(post({ pathname: "/api/admin/webhooks/x", origin: "https://evil.example" })).allowed, false);
});
