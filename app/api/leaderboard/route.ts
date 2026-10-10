import { NextResponse } from "next/server";
import { getPublicDisplay } from "@/lib/event-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPublicDisplay(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ mode: "idle", serverNow: new Date().toISOString() });
  }
}
