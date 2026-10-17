import { NextResponse } from "next/server";
import { z } from "zod";
import { masterRevokeAccess, masterSendAccess } from "@/lib/auth/captainAuth";
import { createDisplayLink, revokeDisplayLink } from "@/lib/auth/displayAuth";
import { normaliseEmail, requireMaster } from "@/lib/auth/masters";
import { resetSignInLock } from "@/lib/auth/otp";
import { signOutAllMasters } from "@/lib/auth/masterAuth";
import { currentViewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { errorResponse, UserError } from "@/lib/errors";
import {
  addTeam,
  closeSuddenDeath,
  confirmScoresGreen,
  controlRound,
  correctAnswerKey,
  deleteTeam,
  getMasterOverview,
  importRounds,
  importTeams,
  loadQuestionPack,
  overrideScore,
  publishAudienceStandings,
  publishRound,
  qualifyStage,
  recordManualSubmission,
  recordManualSuddenDeath,
  scoreRound,
  setAudioSettings,
  setDisplay,
  setTeamActive,
  startSuddenDeath,
  updateRound,
  updateTeam,
  upgradeEventSchedule,
} from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    requireMaster(viewer);
    // The Audit tab asks for the long log; every other poll stays small.
    const full = new URL(request.url).searchParams.get("audit") === "full";
    return NextResponse.json(await getMasterOverview({ auditLimit: full ? 400 : 60 }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "master");
  }
}

const text = z.string().max(5000);
const short = z.string().max(200);
const id = z.string().min(1).max(100);
const team = { name: z.string().max(120), tableNumber: z.string().max(40), captainName: z.string().max(120), captainEmail: z.string().max(254) };
const letters = z.array(z.string().min(1).max(3)).max(6);
const roundId = id;
const step = z.number().int().min(0).max(30);
const sdLetter = z.enum(["A", "B", "C", "D"]);
const stage = z.enum(["top2", "final", "audience"]);

const display = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("idle") }),
  z.object({ mode: z.literal("standings") }),
  z.object({ mode: z.literal("question"), roundId }),
  z.object({ mode: z.literal("reveal"), roundId, step }),
  z.object({ mode: z.literal("qualifiers"), stage: z.literal("top2"), step }),
  z.object({ mode: z.literal("awards"), step }),
  z.object({ mode: z.literal("sudden-death"), id, step }),
]);

/** Every Master action and its exact input. Anything else is rejected before it reaches the event store. */
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add-team"), ...team }),
  z.object({ action: z.literal("import-teams"), csv: z.string().max(100_000) }),
  z.object({ action: z.literal("update-team"), id, ...team }),
  z.object({ action: z.literal("transfer-captain"), id, ...team }),
  z.object({ action: z.literal("set-team-active"), id, active: z.boolean() }),
  z.object({ action: z.literal("delete-team"), id }),
  z.object({ action: z.literal("send-access"), id }),
  z.object({ action: z.literal("revoke-access"), id }),
  z.object({ action: z.literal("reset-sign-in-lock"), email: z.string().email() }),
  z.object({ action: z.literal("upgrade-schedule") }),
  z.object({ action: z.literal("load-question-pack") }),
  z.object({
    action: z.literal("update-round"),
    id,
    title: text,
    scenario: text,
    options: z.array(z.object({ id: z.string().min(1).max(3), text })).length(6),
    answers: letters,
    evidence: z.array(text).max(3),
    context: text.optional(),
    leadHat: text.optional(),
    principle: text.optional(),
    othersNote: text.optional(),
    followUp: text.optional(),
    durationSeconds: z.number().int().min(10).max(3600),
    multiplier: z.number().int().min(1).max(10),
  }),
  z.object({ action: z.literal("correct-answer-key"), roundId, answers: letters, evidence: z.array(text).max(3), reason: text }),
  z.object({ action: z.literal("import-rounds"), rounds: z.array(z.unknown()).max(20) }),
  z.object({ action: z.literal("round-control"), control: z.enum(["open", "pause", "resume", "extend", "close"]), roundId, seconds: z.number().int().min(10).max(600).optional(), reason: text.optional() }),
  z.object({ action: z.literal("score-round"), roundId }),
  z.object({ action: z.literal("confirm-scores-green"), roundId }),
  z.object({ action: z.literal("override-score"), roundId, teamId: id, points: z.number().int().min(0).max(100).nullable(), reason: text }),
  z.object({ action: z.literal("publish-round"), roundId }),
  z.object({ action: z.literal("publish-audience"), roundId: z.literal("round-4") }),
  z.object({ action: z.literal("record-manual-submission"), roundId, teamId: id, choices: letters, reason: text }),
  z.object({ action: z.literal("qualify"), stage, selectedTeamIds: z.array(id).max(30).optional(), note: text.optional(), suddenDeathId: id.optional() }),
  z.object({ action: z.literal("start-sudden-death"), stage, questionKey: z.string().max(20), question: z.string().max(500), options: z.array(short).length(4), correctOption: sdLetter, previousId: id.optional() }),
  z.object({ action: z.literal("close-sudden-death"), id }),
  z.object({ action: z.literal("manual-sudden-death"), suddenDeathId: id, teamId: id, choice: sdLetter, reason: text }),
  z.object({ action: z.literal("sign-out-all-masters") }),
  z.object({ action: z.literal("set-audio"), music: z.boolean(), sfx: z.boolean() }),
  z.object({ action: z.literal("display"), display }),
  z.object({ action: z.literal("create-display-link"), label: z.string().max(60).optional() }),
  z.object({ action: z.literal("revoke-display-link"), id }),
]);

export async function POST(request: Request) {
  try {
    const viewer = await currentViewer();
    if (!viewer) return NextResponse.json({ error: "Your Master session has ended. Sign in again." }, { status: 401 });
    requireMaster(viewer);
    const parsed = Action.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new UserError("That request was not understood. Refresh the console and try again.");
    const body = parsed.data;
    const run = async (): Promise<unknown> => {
      switch (body.action) {
        case "add-team": return addTeam(viewer, body);
        case "import-teams": return importTeams(viewer, body.csv);
        case "update-team": return updateTeam(viewer, body);
        case "transfer-captain": return updateTeam(viewer, { ...body, transfer: true });
        case "set-team-active": return setTeamActive(viewer, body.id, body.active);
        case "delete-team": return deleteTeam(viewer, body.id);
        case "send-access": return masterSendAccess(viewer, body.id);
        case "revoke-access": return masterRevokeAccess(viewer, body.id);
        case "reset-sign-in-lock": {
          const email = normaliseEmail(body.email);
          await resetSignInLock(email);
          return audit(viewer.email, "auth.lock_reset", email, {});
        }
        case "upgrade-schedule": return upgradeEventSchedule(viewer);
        case "load-question-pack": return loadQuestionPack(viewer);
        case "update-round": return updateRound(viewer, body);
        case "correct-answer-key": return correctAnswerKey(viewer, body);
        case "import-rounds": return importRounds(viewer, body.rounds);
        case "round-control": return controlRound(viewer, { action: body.control, roundId: body.roundId, seconds: body.seconds, reason: body.reason });
        case "score-round": return scoreRound(viewer, body.roundId);
        case "confirm-scores-green": return confirmScoresGreen(viewer, body.roundId);
        case "override-score": return overrideScore(viewer, body);
        case "publish-round": return publishRound(viewer, body.roundId);
        case "publish-audience": return publishAudienceStandings(viewer, body.roundId);
        case "record-manual-submission": return recordManualSubmission(viewer, body);
        case "qualify": return qualifyStage(viewer, body);
        case "start-sudden-death": return startSuddenDeath(viewer, body);
        case "close-sudden-death": return closeSuddenDeath(viewer, body.id);
        case "manual-sudden-death": return recordManualSuddenDeath(viewer, body);
        case "set-audio": return setAudioSettings(viewer, body);
        case "sign-out-all-masters": return signOutAllMasters(viewer);
        case "display": return setDisplay(viewer, body.display);
        case "create-display-link": return createDisplayLink(viewer, body.label ?? "");
        case "revoke-display-link": return revokeDisplayLink(viewer, body.id);
      }
    };
    return NextResponse.json({ ok: true, result: (await run()) ?? null });
  } catch (error) {
    return errorResponse(error, "master");
  }
}
