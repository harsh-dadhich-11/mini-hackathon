import { NextResponse } from "next/server";
import { MASTER_COOKIE, signOutMaster } from "@/lib/auth/masterAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  await signOutMaster().catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(MASTER_COOKIE);
  return response;
}
