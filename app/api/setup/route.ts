import { NextResponse } from "next/server";
import { bootstrapEvent } from "@/lib/event-store";
import { currentViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    await bootstrapEvent(viewer);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to configure the event." }, { status: 400 });
  }
}
