// Cross-site request forgery guard for cookie-authenticated API calls. Pure so the
// decision can be unit-tested; the thin wrapper lives in proxy.ts.
//
// Browsers attach cookies to cross-site POSTs, so an attacker's page could make a
// logged-in admin's browser change settings. Browsers also tell us where the request
// came from: `Origin` on every cross-origin and every POST/PUT/PATCH/DELETE request,
// and `Sec-Fetch-Site` on every request from a current browser. Both are set by the
// browser itself and cannot be forged by page script.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Routes that are called server-to-server and authenticate with a signature or
// secret instead of a cookie. They carry no browser cookies, so there is nothing for
// CSRF to ride on, and the caller (Razorpay) sends no Origin header.
const EXEMPT_PREFIXES = ["/api/webhooks/"];

export function isCsrfExemptPath(pathname: string) {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export type CsrfInput = {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  // Only honoured when trustProxy is true (TRUST_PROXY=1, nginx in front).
  forwardedHost?: string | null;
  trustProxy?: boolean;
};

export type CsrfDecision = { allowed: true } | { allowed: false; reason: string };

function hostCandidates(value: string | null | undefined) {
  const raw = value?.split(",")[0]?.trim().toLowerCase();
  if (!raw) return [];
  // An explicit default port is the same host as the bare name in an Origin header.
  const candidates = [raw];
  if (raw.endsWith(":443")) candidates.push(raw.slice(0, -4));
  if (raw.endsWith(":80")) candidates.push(raw.slice(0, -3));
  return candidates;
}

export function csrfDecision(input: CsrfInput): CsrfDecision {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { allowed: true };
  if (isCsrfExemptPath(input.pathname)) return { allowed: true };

  const origin = input.origin?.trim();
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      // Includes the literal "null" origin sent from sandboxed or opaque contexts.
      return { allowed: false, reason: "origin-unparseable" };
    }
    const own = new Set([
      ...hostCandidates(input.host),
      ...(input.trustProxy ? hostCandidates(input.forwardedHost) : [])
    ]);
    return own.has(originHost) ? { allowed: true } : { allowed: false, reason: "origin-mismatch" };
  }

  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) {
    // "none" is a user-initiated request (typed URL, bookmark). "same-site" is not
    // good enough: a sibling subdomain is a different origin.
    return site === "same-origin" || site === "none"
      ? { allowed: true }
      : { allowed: false, reason: "fetch-site-cross" };
  }

  // Neither header: not a browser (curl, scripts, server code). Without a browser
  // there are no ambient cookies to abuse, so this is not a CSRF vector.
  return { allowed: true };
}

export const CSRF_REJECTION_MESSAGE =
  "This request did not come from our website, so it was blocked. Reload the page and try again.";
