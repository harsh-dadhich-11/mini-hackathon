import { NextResponse } from "next/server";
import { requestCaptainAccess } from "@/lib/captain-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    await requestCaptainAccess(String(body.email ?? ""));
  } catch (error) {
    console.log("[captain] code request failed", error);
  }
  // Same answer either way, so the roster can't be probed.
  return NextResponse.json({ ok: true, message: "If that email belongs to a Captain, a code is on its way." });
}
