import { NextResponse } from "next/server";
import { getCaptainTeam } from "@/lib/auth/captainAuth";
import { hit } from "@/lib/auth/rateLimit";
import { errorResponse } from "@/lib/errors";
import { submitSuddenDeath } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Generous for a Captain changing their mind, tight enough that no device can flood the database or the audit log. */
const SAVES_PER_10_SECONDS = 20;

/** A tied team's sudden-death number. */
export async function POST(request: Request) {
  try {
    const team = await getCaptainTeam();
    if (!team) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    if (await hit(`save:${team.id}`, 10) > SAVES_PER_10_SECONDS) return NextResponse.json({ error: "Too many saves at once. Wait a few seconds and try again." }, { status: 429 });
    const body = await request.json().catch(() => ({})) as { suddenDeathId?: unknown; value?: unknown };
    return NextResponse.json({ ok: true, result: await submitSuddenDeath(team, String(body.suddenDeathId ?? ""), body.value) });
  } catch (error) {
    return errorResponse(error, "team/sudden-death");
  }
}
