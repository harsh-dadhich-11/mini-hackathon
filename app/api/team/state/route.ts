import { NextResponse } from "next/server";
import { getCaptainTeam } from "@/lib/captain-auth";
import { getTeamState } from "@/lib/event-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const team = await getCaptainTeam();
    if (!team) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    return NextResponse.json(await getTeamState(team), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the round." }, { status: 500 });
  }
}
