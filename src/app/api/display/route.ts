import { NextResponse } from "next/server";
import { canViewDisplay } from "@/lib/auth/displayAuth";
import { errorResponse } from "@/lib/errors";
import { getPublicDisplay } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * The projector's state feed, for a signed-in Master or a projector link. It never contains answer-key data
 * ahead of a reveal. Errors return 5xx so the screen keeps its last good frame instead of flashing the welcome slide.
 */
export async function GET() {
  try {
    if (!(await canViewDisplay())) return NextResponse.json({ error: "This screen's projector link has been revoked or has expired." }, { status: 401 });
    return NextResponse.json(await getPublicDisplay(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "display");
  }
}
