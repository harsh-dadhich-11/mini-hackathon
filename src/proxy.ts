import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF guard for every API write. A request must come from this site's own pages (the browser says so with
 * Sec-Fetch-Site, or an Origin matching this host) and carry a JSON body, which a cross-site form cannot send.
 * Reads (GET/HEAD), including the projector-link redirect, pass straight through.
 */
export function proxy(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return NextResponse.next();
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const sameOrigin = site
    ? site === "same-origin"
    : Boolean(origin && host && new URL(origin).host === host);
  const json = request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
  if (!sameOrigin || !json) return NextResponse.json({ error: "This request was blocked. Reload the page and try again." }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
