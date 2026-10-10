import { NextResponse } from "next/server";
import { getCaptainTeam } from "@/lib/captain-auth";
import { submitForTeam } from "@/lib/event-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const team = await getCaptainTeam();
    if (!team) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const body = await request.json() as { choices?: string[] };
    return NextResponse.json({ ok: true, result: await submitForTeam(team, body.choices ?? []) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit." }, { status: 400 });
  }
}
