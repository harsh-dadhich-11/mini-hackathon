import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/captainAuth";
import { DISPLAY_COOKIE, DISPLAY_LINK_HOURS, isLiveDisplayKey } from "@/lib/auth/displayAuth";

export const dynamic = "force-dynamic";

/** Opening a projector link stores its key in an HTTP-only cookie, then sends the browser to a clean /display URL. */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const target = new URL("/display", request.url);
  if (!(await isLiveDisplayKey(key).catch(() => false))) {
    target.searchParams.set("link", "invalid");
    return NextResponse.redirect(target, 303);
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(sessionCookie(key, request, DISPLAY_COOKIE, DISPLAY_LINK_HOURS));
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
