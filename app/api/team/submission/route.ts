import { NextResponse } from "next/server";
import { submitForCaptain } from "@/lib/event-store";
import { currentViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const body = await request.json() as { choices?: string[] };
    const result = await submitForCaptain(viewer, body.choices ?? []);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit." }, { status: 400 });
  }
}
