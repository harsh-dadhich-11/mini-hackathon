import { NextResponse } from "next/server";
import { CAPTAIN_COOKIE, signOutCaptain } from "@/lib/auth/captainAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  await signOutCaptain().catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CAPTAIN_COOKIE);
  return response;
}
