import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth/viewer";
import { errorResponse } from "@/lib/errors";
import { bootstrapEvent } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    await bootstrapEvent(viewer);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "setup");
  }
}
