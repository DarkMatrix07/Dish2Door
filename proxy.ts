import { NextResponse, type NextRequest } from "next/server";
import { CSRF_REJECTION_MESSAGE, csrfDecision } from "@/lib/csrf";

// Request interception (this is `middleware.ts` renamed in Next 16). It only guards
// state-changing API calls against cross-site forgery; pages and static files are not
// matched. The decision logic is in lib/csrf.ts.
export function proxy(request: NextRequest) {
  const decision = csrfDecision({
    method: request.method,
    pathname: request.nextUrl.pathname,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    trustProxy: process.env.TRUST_PROXY === "1"
  });

  if (!decision.allowed) {
    return NextResponse.json({ error: CSRF_REJECTION_MESSAGE }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};
