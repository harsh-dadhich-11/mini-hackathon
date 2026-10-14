import { NextResponse } from "next/server";
import { masterRevokeAccess, masterSendAccess } from "@/lib/captain-auth";
import {
  addTeam,
  confirmScoresGreen,
  controlRound,
  deleteTeam,
  getMasterOverview,
  importRounds,
  importTeams,
  overrideScore,
  publishAudienceStandings,
  publishRound,
  qualifyStage,
  recordManualSubmission,
  requireMaster,
  scoreRound,
  setDisplay,
  setTeamActive,
  updateRound,
  updateTeam,
  upgradeEventToV4,
  type Display,
  type Option,
  type RoundControl,
  type Stage,
} from "@/lib/event-store";
import { currentViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    try {
      await requireMaster(viewer);
    } catch {
      return NextResponse.json({ error: "Master access is required." }, { status: 403 });
    }
    return NextResponse.json(await getMasterOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The overview could not be loaded." }, { status: 500 });
  }
}

const text = (value: unknown) => String(value ?? "");
const team = (body: Record<string, unknown>) => ({
  name: text(body.name),
  tableNumber: text(body.tableNumber),
  captainName: text(body.captainName),
  captainEmail: text(body.captainEmail),
});

export async function POST(request: Request) {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const run = async (): Promise<unknown> => {
      switch (body.action) {
        case "add-team": return addTeam(viewer, team(body));
        case "import-teams": return importTeams(viewer, text(body.csv));
        case "update-team": return updateTeam(viewer, { id: text(body.id), ...team(body) });
        case "transfer-captain": return updateTeam(viewer, { id: text(body.id), ...team(body), transfer: true });
        case "set-team-active": return setTeamActive(viewer, text(body.id), body.active === true);
        case "delete-team": return deleteTeam(viewer, text(body.id));
        case "send-access": return masterSendAccess(viewer, text(body.id));
        case "revoke-access": return masterRevokeAccess(viewer, text(body.id));
        case "upgrade-v4": return upgradeEventToV4(viewer);
        case "update-round":
          return updateRound(viewer, {
            id: text(body.id),
            title: text(body.title),
            scenario: text(body.scenario),
            options: Array.isArray(body.options) ? body.options as Option[] : [],
            answers: Array.isArray(body.answers) ? body.answers.map(String) : [],
            evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : [],
            durationSeconds: Number(body.durationSeconds),
            multiplier: Number(body.multiplier),
          });
        case "import-rounds": return importRounds(viewer, Array.isArray(body.rounds) ? body.rounds : []);
        case "round-control":
          return controlRound(viewer, { action: body.control as RoundControl, roundId: text(body.roundId), seconds: Number(body.seconds), reason: text(body.reason) });
        case "score-round": return scoreRound(viewer, text(body.roundId));
        case "confirm-scores-green": return confirmScoresGreen(viewer, text(body.roundId));
        case "override-score":
          return overrideScore(viewer, { roundId: text(body.roundId), teamId: text(body.teamId), points: body.points === null ? null : Number(body.points), reason: text(body.reason) });
        case "publish-round": return publishRound(viewer, text(body.roundId));
        case "publish-audience": {
          const roundId = text(body.roundId);
          if (roundId !== "round-4" && roundId !== "round-6") throw new Error("Audience standings can be published after Round 4 or Round 6.");
          return publishAudienceStandings(viewer, roundId);
        }
        case "record-manual-submission": {
          const source = text(body.source);
          if (source !== "paper" && source !== "paddle") throw new Error("Unknown manual-entry source.");
          return recordManualSubmission(viewer, { roundId: text(body.roundId), teamId: text(body.teamId), choices: Array.isArray(body.choices) ? body.choices.map(String) : [], source, reason: text(body.reason) });
        }
        case "qualify":
          return qualifyStage(viewer, { stage: body.stage as Stage, selectedTeamIds: Array.isArray(body.selectedTeamIds) ? body.selectedTeamIds.map(String) : undefined, note: text(body.note) });
        case "display": return setDisplay(viewer, body.display as Display);
        default: throw new Error("Unknown action.");
      }
    };
    return NextResponse.json({ ok: true, result: (await run()) ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the change." }, { status: 400 });
  }
}
