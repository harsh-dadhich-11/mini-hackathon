import { NextResponse } from "next/server";
import {
  addMaster,
  addTeam,
  controlRound,
  getMasterOverview,
  requireMaster,
  updateRound,
} from "@/lib/event-store";
import { currentViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    await requireMaster(viewer);
    return NextResponse.json(await getMasterOverview());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Master access is required." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const body = await request.json() as { action?: string; [key: string]: unknown };
    if (body.action === "add-team") {
      await addTeam(viewer, {
        name: String(body.name ?? ""),
        tableNumber: String(body.tableNumber ?? ""),
        captainName: String(body.captainName ?? ""),
        captainEmail: String(body.captainEmail ?? ""),
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "add-master") {
      await addMaster(viewer, String(body.email ?? ""), String(body.displayName ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update-round") {
      await updateRound(viewer, {
        id: String(body.id ?? ""),
        title: String(body.title ?? ""),
        scenario: String(body.scenario ?? ""),
        options: Array.isArray(body.options) ? body.options as { id: string; text: string }[] : [],
        answers: Array.isArray(body.answers) ? body.answers as string[] : [],
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "round-control") {
      const result = await controlRound(viewer, {
        action: body.control as "open" | "close" | "score-publish",
        roundId: String(body.roundId ?? ""),
        rankLimit: typeof body.rankLimit === "number" ? body.rankLimit : undefined,
      });
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the change." }, { status: 400 });
  }
}
