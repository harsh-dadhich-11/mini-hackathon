import { NextResponse } from "next/server";
import { getPublicDisplay } from "@/lib/event-store";
import { getMasterViewer } from "@/lib/master-auth";

export const dynamic = "force-dynamic";

/** The projector's state feed. Masters only; it never contains answer-key data ahead of a reveal. */
export async function GET() {
  if (!(await getMasterViewer())) return NextResponse.json({ error: "Master sign-in required." }, { status: 401 });
  try {
    return NextResponse.json(await getPublicDisplay(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ mode: "idle", serverNow: new Date().toISOString() });
  }
}
