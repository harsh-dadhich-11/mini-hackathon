import { NextResponse } from "next/server";
import { getCaptainTeam } from "@/lib/auth/captainAuth";
import { errorResponse } from "@/lib/errors";
import { getTeamState } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    const team = await getCaptainTeam();
    if (!team) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    return NextResponse.json(await getTeamState(team), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "team/state");
  }
}
