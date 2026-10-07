import { NextResponse } from "next/server";
import { getPublicLeaderboard } from "@/lib/event-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPublicLeaderboard(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ label: "Leaderboard", entries: [], publishedAt: null });
  }
}
