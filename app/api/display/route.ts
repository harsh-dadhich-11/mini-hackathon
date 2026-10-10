import { NextResponse } from "next/server";
import { getPublicDisplay } from "@/lib/event-store";

export const dynamic = "force-dynamic";

/** The projector's deliberately small, public state feed. It never contains Captain or answer-key data ahead of a reveal. */
export async function GET() {
  try {
    return NextResponse.json(await getPublicDisplay(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ mode: "idle", serverNow: new Date().toISOString() });
  }
}
