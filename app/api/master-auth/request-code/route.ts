import { NextResponse } from "next/server";
import { requestMasterAccess } from "@/lib/master-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    await requestMasterAccess(String(body.email ?? ""));
  } catch (error) {
    console.log("[master] code request failed", error);
  }
  // Same answer either way, so the Master list can't be probed.
  return NextResponse.json({ ok: true, message: "If that email belongs to a Master, a code is on its way." });
}
