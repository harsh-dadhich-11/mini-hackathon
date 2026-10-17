import "server-only";
import { MASTER_EMAILS, MAX_TEAMS, PUBLISH_LIMIT, SCHEDULE, SCORED_ROUND_IDS, STAGES, SUBMIT_GRACE_MS, SUDDEN_DEATH_SECONDS } from "@/data/event";
import { QUESTION_PACK } from "@/data/questions";
import { SUDDEN_DEATH_BANK } from "@/data/suddenDeath";
import { audit } from "@/lib/audit";
import { isMaster, normaliseEmail, requireMaster } from "@/lib/auth/masters";
import { discardCodes, LOCK_PREFIX, OTP_LIMITS } from "@/lib/auth/otp";
import { overLimit } from "@/lib/auth/rateLimit";
import { parseRoster } from "@/lib/csv";
import { database, type Transaction } from "@/lib/db/client";
import { UserError } from "@/lib/errors";
import { LAST_REVEAL_STEP, parseJson, parseOptions, parseStrings, toPublicEntries, toPublicQuestion, toPublicReveal, toPublicSuddenDeath, toTeamReveal, toTeamRound, toTeamSuddenDeath, type TeamReveal } from "@/lib/game/publicViews";
import { cutoffTie, rankTeams, scoreSubmission, type Ranked, type Total } from "@/lib/game/scoring";
import { resolvePicks, rulingNote, SUDDEN_DEATH_LETTERS } from "@/lib/game/suddenDeath";
import type { AudioSettings, Display, Option, Phase, PublicTeam, RoundControl, RoundRecord, Stage, SuddenDeathRecord, TeamRecord, Viewer } from "@/types";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const ROUND_COLUMNS =
  "id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, evidence_json AS evidenceJson, context, lead_hat AS leadHat, principle, others_note AS othersNote, follow_up AS followUp, multiplier, state, opened_at AS openedAt, closes_at AS closesAt, paused_remaining_ms AS pausedRemainingMs";

/** Rounds after `phase` whose start locks that phase's qualification. */
const NEXT_PHASE: Record<Phase, { phase: Phase; stage: string; round: string } | null> = {
  trial: null,
  prelim: { phase: "final", stage: "The Top 2", round: "Round 5" },
  final: null,
};

function friendlyConstraintError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("teams.captain_email") || message.includes("teams_captain_email_unique")) throw new UserError("That Captain email is already assigned to another team.", 409);
  if (message.includes("teams.name") || message.includes("teams_name_unique")) throw new UserError("Another team already has that name.", 409);
  throw error;
}

// ---------------------------------------------------------------- Setup

/** True once a Master has run the one-time setup that creates the round schedule. */
export async function eventConfigured() {
  const row = await database().prepare("SELECT key FROM event_settings WHERE key = 'event_name'").first();
  return Boolean(row);
}

/** Captain and public-display services stay dormant until at least one active team exists (up to 30). */
export async function eventReady() {
  const row = await database().prepare("SELECT COUNT(*) AS count FROM teams WHERE is_active = 1").first<{ count: number }>();
  return Number(row?.count ?? 0) >= 1;
}

function insertRounds(timestamp: string) {
  const db = database();
  return SCHEDULE.map(([roundId, roundOrder, title, phase, durationSeconds, multiplier]) =>
    db.prepare("INSERT INTO rounds (id, round_order, title, phase, duration_seconds, multiplier, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
      .bind(roundId, roundOrder, title, phase, durationSeconds, multiplier, timestamp, timestamp));
}

export async function bootstrapEvent(viewer: Viewer) {
  requireMaster(viewer);
  if (await eventConfigured()) throw new UserError("The event has already been configured.", 409);
  const db = database();
  const timestamp = now();
  await db.batch([
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("event_name", "Boardroom Challenge", timestamp),
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("display", JSON.stringify({ mode: "idle" }), timestamp),
    ...insertRounds(timestamp),
  ]);
  await audit(viewer.email, "event.bootstrap", "event", { rounds: SCHEDULE.length });
}

type ScheduleRow = { id: string; title: string; phase: string };
type ScheduleEntry = (typeof SCHEDULE)[number];

const sameRounds = (rows: ScheduleRow[], entries: readonly ScheduleEntry[]) =>
  rows.length === entries.length && rows.every((row, index) => row.id === entries[index][0] && row.title === entries[index][2] && row.phase === entries[index][3]);

/** True when the stored rounds are exactly the current schedule (ids, titles and phases). */
function scheduleMatches(rows: ScheduleRow[]) {
  return sameRounds(rows, SCHEDULE);
}

/** Explicit safe upgrade path for an unused event on an earlier schedule (e.g. v4's Top 5 playoff); it never discards game activity. */
export async function upgradeEventSchedule(viewer: Viewer) {
  requireMaster(viewer);
  const db = database();
  const [existingRounds, activity] = await db.batch([
    db.prepare("SELECT id, title, phase FROM rounds ORDER BY round_order"),
    db.prepare("SELECT (SELECT COUNT(*) FROM submissions) + (SELECT COUNT(*) FROM score_lines) + (SELECT COUNT(*) FROM qualifications) + (SELECT COUNT(*) FROM sudden_deaths) AS count"),
  ]);
  const rows = existingRounds.results as ScheduleRow[];
  if (scheduleMatches(rows)) return { upgraded: false };
  // Already on the six scored rounds: only add the practice round, keeping every question and any game data.
  const scored = SCHEDULE.filter((entry) => SCORED_ROUND_IDS.includes(entry[0]));
  if (sameRounds(rows, scored)) {
    const timestamp = now();
    await db.batch(insertRounds(timestamp).filter((_, index) => !SCORED_ROUND_IDS.includes(SCHEDULE[index][0])));
    await audit(viewer.email, "event.schedule_upgrade", "event", { addedRoundIds: SCHEDULE.filter((entry) => !SCORED_ROUND_IDS.includes(entry[0])).map((entry) => entry[0]) });
    return { upgraded: true };
  }
  if (Number((activity.results[0] as { count: number } | undefined)?.count ?? 0) > 0) throw new UserError("This event has gameplay data. Do not replace its schedule; create a new event instead.", 409);
  await db.batch([db.prepare("DELETE FROM leaderboard_snapshots"), db.prepare("DELETE FROM rounds"), ...insertRounds(now())]);
  await setDisplayUnchecked({ mode: "idle" });
  await audit(viewer.email, "event.schedule_upgrade", "event", { replacedRoundIds: rows.map((row) => row.id), rounds: SCHEDULE.length });
  return { upgraded: true };
}

// ---------------------------------------------------------------- Teams

type TeamInput = { name: string; tableNumber: string; captainName: string; captainEmail: string };

function cleanTeam(input: TeamInput) {
  const team = { name: input.name.trim(), tableNumber: input.tableNumber.trim(), captainName: input.captainName.trim(), captainEmail: normaliseEmail(input.captainEmail) };
  if (!team.name || !team.tableNumber || !team.captainName || !team.captainEmail) throw new UserError("Team name, table number, Captain name and Captain email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(team.captainEmail)) throw new UserError(`"${team.captainEmail}" is not a valid email address.`);
  return team;
}

async function insertTeam(viewer: Viewer, input: TeamInput) {
  const team = cleanTeam(input);
  if (isMaster(team.captainEmail)) throw new UserError("A Captain email cannot also be assigned to a Master.");
  const teamId = id();
  const result = await database().prepare(
    "INSERT INTO teams (id, name, table_number, captain_name, captain_email, is_active, created_at) SELECT ?, ?, ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM teams WHERE is_active = 1) < ?",
  ).bind(teamId, team.name, team.tableNumber, team.captainName, team.captainEmail, now(), MAX_TEAMS).run().catch(friendlyConstraintError);
  if (!result.meta.changes) throw new UserError(`The event already has ${MAX_TEAMS} active teams.`, 409);
  await audit(viewer.email, "team.create", teamId, { name: team.name, captainEmail: team.captainEmail });
}

export async function addTeam(viewer: Viewer, input: TeamInput) {
  requireMaster(viewer);
  await insertTeam(viewer, input);
}

/** One team per line: name, table, Captain name, Captain email. Commas inside quotes and tab-separated paste both work. */
export async function importTeams(viewer: Viewer, csv: string) {
  requireMaster(viewer);
  let added = 0;
  const errors: string[] = [];
  for (const row of parseRoster(csv)) {
    try {
      await insertTeam(viewer, row);
      added += 1;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      errors.push(`Line ${row.line} (${row.name || "blank"}): ${error.message}`);
    }
  }
  return { added, errors };
}

/** Changing the Captain email revokes every session signed in with the old one. */
export async function updateTeam(viewer: Viewer, input: TeamInput & { id: string; transfer?: boolean }) {
  requireMaster(viewer);
  const db = database();
  const existing = await db.prepare("SELECT captain_email AS captainEmail FROM teams WHERE id = ?").bind(input.id).first<{ captainEmail: string }>();
  if (!existing) throw new UserError("Team not found.", 404);
  const team = cleanTeam(input);
  if (isMaster(team.captainEmail)) throw new UserError("A Captain email cannot also be assigned to a Master.");
  const emailChanged = team.captainEmail !== existing.captainEmail;
  await db.batch([
    db.prepare("UPDATE teams SET name = ?, table_number = ?, captain_name = ?, captain_email = ? WHERE id = ?").bind(team.name, team.tableNumber, team.captainName, team.captainEmail, input.id),
    ...(emailChanged
      ? [
        db.prepare("UPDATE captain_sessions SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL").bind(now(), input.id),
        discardCodes(existing.captainEmail),
      ]
      : []),
  ]).catch(friendlyConstraintError);
  await audit(viewer.email, emailChanged ? (input.transfer ? "captain.transfer" : "team.captain_replaced") : "team.update", input.id, { ...team, previousEmail: emailChanged ? existing.captainEmail : undefined });
}

export async function setTeamActive(viewer: Viewer, teamId: string, active: boolean) {
  requireMaster(viewer);
  const db = database();
  if (active) {
    const result = await db.prepare("UPDATE teams SET is_active = 1 WHERE id = ? AND (SELECT COUNT(*) FROM teams WHERE is_active = 1) < ?").bind(teamId, MAX_TEAMS).run();
    if (!result.meta.changes) throw new UserError(`The event already has ${MAX_TEAMS} active teams.`, 409);
  } else {
    // A qualified team dropping out would silently change the stage pools and the reveals.
    const qualified = await db.prepare("SELECT stage FROM qualifications WHERE team_id = ? LIMIT 1").bind(teamId).first<{ stage: Stage }>();
    if (qualified) throw new UserError(`This team holds a confirmed ${STAGES[qualified.stage].label} place. Re-confirm that stage without them before deactivating.`, 409);
    await db.batch([
      db.prepare("UPDATE teams SET is_active = 0 WHERE id = ?").bind(teamId),
      db.prepare("UPDATE captain_sessions SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL").bind(now(), teamId),
    ]);
  }
  await audit(viewer.email, active ? "team.activate" : "team.deactivate", teamId, {});
}

/** Only for teams that never played (test or mistaken entries). Teams with history must be deactivated instead. */
export async function deleteTeam(viewer: Viewer, teamId: string) {
  requireMaster(viewer);
  const db = database();
  const team = await db.prepare(
    `SELECT name, captain_email AS captainEmail,
       (SELECT COUNT(*) FROM submissions WHERE team_id = t.id) + (SELECT COUNT(*) FROM score_lines WHERE team_id = t.id) + (SELECT COUNT(*) FROM qualifications WHERE team_id = t.id) + (SELECT COUNT(*) FROM sudden_death_answers WHERE team_id = t.id) AS history
     FROM teams t WHERE t.id = ?`,
  ).bind(teamId).first<{ name: string; captainEmail: string; history: number }>();
  if (!team) throw new UserError("Team not found.", 404);
  if (Number(team.history) > 0) throw new UserError(`${team.name} already has answers or scores. Deactivate it instead.`, 409);
  await db.batch([
    db.prepare("DELETE FROM captain_sessions WHERE team_id = ?").bind(teamId),
    discardCodes(team.captainEmail),
    db.prepare("DELETE FROM teams WHERE id = ?").bind(teamId),
  ]);
  await audit(viewer.email, "team.delete", teamId, { name: team.name, captainEmail: team.captainEmail });
}

// ---------------------------------------------------------------- Rounds & timer

/**
 * A round or sudden death whose server deadline (plus the in-flight grace) has passed is closed, even if no Master
 * clicked Close. One statement, so every poll pays a single round trip for it.
 */
async function settleExpiredRounds() {
  const timestamp = now();
  const cutoff = new Date(Date.now() - SUBMIT_GRACE_MS).toISOString();
  await database().prepare(
    `WITH r AS (UPDATE rounds SET state = 'closed', updated_at = ? WHERE state = 'open' AND closes_at <= ? RETURNING 1),
          s AS (UPDATE sudden_deaths SET state = 'closed' WHERE state = 'open' AND closes_at <= ? RETURNING 1)
     SELECT (SELECT COUNT(*) FROM r) + (SELECT COUNT(*) FROM s) AS changed`,
  ).bind(timestamp, cutoff, cutoff).run();
}

/** Answers are still accepted this long after the deadline, for requests already on their way at 00:00. */
const graceCutoff = () => new Date(Date.now() - SUBMIT_GRACE_MS).toISOString();

/** The round, or null when no such round exists. Database errors still throw. */
async function findRound(roundId: string) {
  return database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = ?`).bind(roundId).first<RoundRecord>();
}

async function getRound(roundId: string) {
  const round = await findRound(roundId);
  if (!round) throw new UserError("Round not found.", 404);
  return round;
}

/** The round teams and the projector care about: the latest one that has left draft. */
async function getCurrentRound() {
  return database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE state <> 'draft' ORDER BY round_order DESC LIMIT 1`).first<RoundRecord>();
}

/** Three distinct Boardroom Choices, each one of the round's six option ids. */
function checkAnswerKey(optionIds: string[], answers: string[]) {
  if (answers.length !== 3 || new Set(answers).size !== 3 || answers.some((answer) => !optionIds.includes(answer))) {
    throw new UserError("Choose three different Boardroom Choices from the six options.");
  }
}

type RoundInput = {
  id: string;
  title: string;
  scenario: string;
  options: Option[];
  answers: string[];
  evidence: string[];
  durationSeconds: number;
  multiplier: number;
  context?: string;
  leadHat?: string;
  principle?: string;
  othersNote?: string;
  followUp?: string;
};

export async function updateRound(viewer: Viewer, input: RoundInput) {
  requireMaster(viewer);
  const options = input.options.map((option) => ({ id: String(option.id).trim(), text: String(option.text ?? "").trim() }));
  const ids = options.map((option) => option.id);
  if (options.length !== 6 || new Set(ids).size !== 6 || ids.some((optionId) => !optionId)) throw new UserError("A round needs six options with distinct letters.");
  checkAnswerKey(ids, input.answers);
  if (!input.title.trim() || !input.scenario.trim() || options.some((option) => !option.text)) {
    throw new UserError("Add a title, scenario and text for every option before saving.");
  }
  const scheduled = SCHEDULE.find((entry) => entry[0] === input.id);
  const seconds = scheduled?.[4] ?? 360;
  if (input.durationSeconds !== seconds) throw new UserError(`This round uses a fixed ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} submission lock. Use the audited emergency Extend control only on game day.`);
  if (input.multiplier !== 1) throw new UserError("The game uses the fixed 40/30/20 score model; the multiplier must be 1.");
  const evidence = [0, 1, 2].map((index) => String(input.evidence[index] ?? "").trim());
  const extra = (value: string | undefined) => String(value ?? "").trim();
  const result = await database().prepare(
    "UPDATE rounds SET title = ?, scenario = ?, options_json = ?, answers_json = ?, evidence_json = ?, context = ?, lead_hat = ?, principle = ?, others_note = ?, follow_up = ?, duration_seconds = ?, multiplier = ?, updated_at = ? WHERE id = ? AND state = 'draft'",
  ).bind(
    input.title.trim(), input.scenario.trim(), JSON.stringify(options), JSON.stringify(input.answers), JSON.stringify(evidence),
    extra(input.context), extra(input.leadHat), extra(input.principle), extra(input.othersNote), extra(input.followUp),
    input.durationSeconds, input.multiplier, now(), input.id,
  ).run();
  if (!result.meta.changes) throw new UserError("Only draft rounds can be edited. To fix the Boardroom Choices of a live or scored round, use Correct answer key.", 409);
  await audit(viewer.email, "round.update", input.id, { durationSeconds: input.durationSeconds, multiplier: input.multiplier });
}

/**
 * Fixes the Boardroom Choices (and their evidence) after a round has opened, e.g. a typo found mid-event.
 * Scenario and options stay fixed because teams have already seen them. A scored round must be re-scored afterwards.
 */
export async function correctAnswerKey(viewer: Viewer, input: { roundId: string; answers: string[]; evidence: string[]; reason: string }) {
  requireMaster(viewer);
  const reason = input.reason.trim();
  if (!reason) throw new UserError("Give a reason. It is recorded in the audit log.");
  const round = await getRound(input.roundId);
  if (round.state === "draft") throw new UserError("This round is still a draft. Use Edit instead.");
  checkAnswerKey(parseOptions(round.optionsJson).map((option) => option.id), input.answers);
  const scored = round.state === "scored" || round.state === "revealed";
  if (scored) await assertScoresEditable(round.phase);
  const evidence = [0, 1, 2].map((index) => String(input.evidence[index] ?? "").trim());
  await database().prepare("UPDATE rounds SET answers_json = ?, evidence_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(input.answers), JSON.stringify(evidence), now(), round.id).run();
  await audit(viewer.email, "round.answer_key_corrected", round.id, { previous: parseStrings(round.answersJson), answers: input.answers, reason });
  return { needsRescore: scored };
}

/** Loads a question pack: an array of rounds keyed by `id` (e.g. "round-1"). Fixed timing and scoring are retained when omitted. */
export async function importRounds(viewer: Viewer, items: unknown[]) {
  requireMaster(viewer);
  const existing = (await database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds`).all<RoundRecord>()).results;
  let updated = 0;
  const errors: string[] = [];
  for (const raw of items) {
    const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const round = existing.find((candidate) => candidate.id === item.id);
    if (!round) { errors.push(`Unknown round id "${String(item.id)}".`); continue; }
    try {
      await updateRound(viewer, {
        id: round.id,
        title: String(item.title ?? round.title),
        scenario: String(item.scenario ?? ""),
        options: Array.isArray(item.options)
          ? item.options.map((option: unknown, index: number) => {
            const value = (typeof option === "object" && option !== null ? option : {}) as Record<string, unknown>;
            return { id: String(value.id ?? String.fromCharCode(65 + index)), text: String(value.text ?? "") };
          })
          : [],
        answers: Array.isArray(item.answers) ? item.answers.map(String) : [],
        evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
        context: typeof item.context === "string" ? item.context : round.context,
        leadHat: typeof item.leadHat === "string" ? item.leadHat : round.leadHat,
        principle: typeof item.principle === "string" ? item.principle : round.principle,
        othersNote: typeof item.othersNote === "string" ? item.othersNote : round.othersNote,
        followUp: typeof item.followUp === "string" ? item.followUp : round.followUp,
        durationSeconds: Number(item.durationSeconds ?? round.durationSeconds),
        multiplier: Number(item.multiplier ?? round.multiplier),
      });
      updated += 1;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      errors.push(`${round.id}: ${error.message}`);
    }
  }
  return { updated, errors };
}

/** Loads the bundled Partner Summit question pack into every round that is still a draft. */
export async function loadQuestionPack(viewer: Viewer) {
  requireMaster(viewer);
  const drafts = new Set((await database().prepare("SELECT id FROM rounds WHERE state = 'draft'").all<{ id: string }>()).results.map((row) => row.id));
  const result = await importRounds(viewer, QUESTION_PACK.filter((item) => drafts.has(item.id)));
  await audit(viewer.email, "round.pack_loaded", "event", { updated: result.updated, skipped: QUESTION_PACK.length - drafts.size });
  return { ...result, skipped: QUESTION_PACK.filter((item) => !drafts.has(item.id)).length };
}

const CHANGED_UNDERFOOT = "This round changed while you were looking at it (another Master may have acted). The console has refreshed; check its state and try again.";

export async function controlRound(viewer: Viewer, input: { action: RoundControl; roundId: string; seconds?: number; reason?: string }) {
  requireMaster(viewer);
  await settleExpiredRounds();
  const db = database();
  const round = await getRound(input.roundId);
  const timestamp = now();
  const nowMs = Date.now();

  if (input.action === "open") {
    if (round.state !== "draft") throw new UserError("A round can only be opened once.", 409);
    if (!round.scenario || parseOptions(round.optionsJson).length !== 6 || parseStrings(round.answersJson).length !== 3) throw new UserError("Load the scenario, six options and Boardroom Choices before opening this round.");
    // The practice round is optional, but only before the real game starts.
    if (round.phase === "trial") {
      const started = await db.prepare("SELECT title FROM rounds WHERE phase <> 'trial' AND state <> 'draft' LIMIT 1").first<{ title: string }>();
      if (started) throw new UserError(`The practice round can't run after ${started.title} has started.`, 409);
    }
    // A practice round left running blocks nothing, but it must be closed first so two rounds are never open at once.
    if (await db.prepare("SELECT id FROM rounds WHERE state IN ('open', 'paused') LIMIT 1").first()) throw new UserError("Another round is still running. Close it first.", 409);
    // Stage rounds hold their reveal until the end: Round 6 can open once Round 5 is scored, not published.
    // The practice round never blocks Round 1.
    const unfinished = await db.prepare("SELECT title, phase, state FROM rounds WHERE round_order < ? AND phase <> 'trial' AND state <> 'revealed' AND NOT (phase = 'final' AND state = 'scored') ORDER BY round_order LIMIT 1").bind(round.roundOrder).first<{ title: string; phase: Phase }>();
    if (unfinished) throw new UserError(unfinished.phase === "final" ? `Score ${unfinished.title} before opening the next round. Its reveal waits until after Round 6.` : `Score and publish ${unfinished.title} before opening the next round.`, 409);
    if (round.phase === "final" && !(await stageTeamIds("top2")).size) throw new UserError("Confirm the Top 2 before opening the stage rounds.", 409);
    const closesAt = new Date(nowMs + round.durationSeconds * 1000).toISOString();
    const result = await db.prepare("UPDATE rounds SET state = 'open', opened_at = ?, closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state = 'draft'")
      .bind(timestamp, closesAt, timestamp, round.id).run();
    if (!result.meta.changes) throw new UserError(CHANGED_UNDERFOOT, 409);
    await setDisplayUnchecked({ mode: "question", roundId: round.id });
    await audit(viewer.email, "round.open", round.id, { closesAt });
    return { closesAt };
  }

  if (input.action === "close") {
    const result = await db.prepare("UPDATE rounds SET state = 'closed', closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state IN ('open', 'paused')")
      .bind(timestamp, timestamp, round.id).run();
    if (!result.meta.changes) throw new UserError("This round is not running.", 409);
    await audit(viewer.email, "round.close", round.id, {});
    return {};
  }

  if (input.action !== "pause" && input.action !== "resume" && input.action !== "extend") throw new UserError("Unknown round control.");

  // Pause, resume and extend are emergency overrides: each needs a reason for the audit log.
  const reason = String(input.reason ?? "").trim();
  if (!reason) throw new UserError("Give a reason. It is recorded in the audit log.");

  if (input.action === "pause") {
    const remainingMs = Math.max(0, Date.parse(round.closesAt ?? "") - nowMs);
    const result = await db.prepare("UPDATE rounds SET state = 'paused', paused_remaining_ms = ?, updated_at = ? WHERE id = ? AND state = 'open' AND closes_at > ?")
      .bind(remainingMs, timestamp, round.id, timestamp).run();
    if (!result.meta.changes) throw new UserError("Only a running round can be paused.", 409);
    await audit(viewer.email, "round.pause", round.id, { remainingMs, reason });
    return {};
  }

  if (input.action === "resume") {
    if (round.state !== "paused") throw new UserError("This round is not paused.", 409);
    const closesAt = new Date(nowMs + (round.pausedRemainingMs ?? 0)).toISOString();
    const result = await db.prepare("UPDATE rounds SET state = 'open', closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state = 'paused'")
      .bind(closesAt, timestamp, round.id).run();
    if (!result.meta.changes) throw new UserError(CHANGED_UNDERFOOT, 409);
    await audit(viewer.email, "round.resume", round.id, { closesAt, reason });
    return { closesAt };
  }

  const seconds = Number(input.seconds);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new UserError("Extend by 10 to 600 seconds.");
  let changed: number;
  if (round.state === "paused") {
    changed = (await db.prepare("UPDATE rounds SET paused_remaining_ms = paused_remaining_ms + ?, updated_at = ? WHERE id = ? AND state = 'paused' AND paused_remaining_ms IS NOT NULL")
      .bind(seconds * 1000, timestamp, round.id).run()).meta.changes;
  } else if (round.state === "open" || round.state === "closed") {
    // A closed (but not yet scored) round reopens for `seconds`, for when the room needed more time.
    const base = round.state === "open" ? Math.max(nowMs, Date.parse(round.closesAt ?? "")) : nowMs;
    const later = await db.prepare("SELECT id FROM rounds WHERE round_order > ? AND state <> 'draft' LIMIT 1").bind(round.roundOrder).first();
    if (later) throw new UserError("A later round has already started.", 409);
    // Re-checks the state it was read in, so a round another Master has just scored can't be reopened.
    changed = (await db.prepare("UPDATE rounds SET state = 'open', closes_at = ?, updated_at = ? WHERE id = ? AND state = ?")
      .bind(new Date(base + seconds * 1000).toISOString(), timestamp, round.id, round.state).run()).meta.changes;
  } else {
    throw new UserError("Scored rounds cannot be extended.", 409);
  }
  if (!changed) throw new UserError(CHANGED_UNDERFOOT, 409);
  await audit(viewer.email, round.state === "closed" ? "round.reopen" : "round.extend", round.id, { seconds, reason });
  return {};
}

// ---------------------------------------------------------------- Eligibility & scoring

async function stageTeamIds(stage: Stage) {
  const rows = await database().prepare("SELECT team_id AS teamId FROM qualifications WHERE stage = ?").bind(stage).all<{ teamId: string }>();
  return new Set(rows.results.map((row) => row.teamId));
}

/** In the stage rounds every other team keeps playing: its raw answers count towards the chocolate hamper. */
function teamStanding(teamId: string, phase: Phase, top2: Set<string>) {
  if (phase !== "final") return "official" as const;
  return top2.has(teamId) ? "official" as const : "playing-along" as const;
}

/** Once the next phase has opened, this phase's scores decided who qualified and must not change underneath that decision. */
async function assertScoresEditable(phase: Phase, tx?: Transaction) {
  const next = NEXT_PHASE[phase];
  if (!next) return;
  const statement = database().prepare("SELECT id FROM rounds WHERE phase = ? AND state <> 'draft' LIMIT 1").bind(next.phase);
  const started = tx ? await tx.first(statement) : await statement.first();
  if (started) throw new UserError(`${next.stage} is locked because ${next.round} has started; changing these scores would change who qualified.`, 409);
}

export async function scoreRound(viewer: Viewer, roundId: string) {
  requireMaster(viewer);
  await settleExpiredRounds();
  const db = database();
  // The round row stays locked until the scores are written, so a paper answer or a reopen can't slip in between.
  const { round, scored } = await db.transaction(async (tx) => {
    const round = await tx.first<RoundRecord>(db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = ? FOR UPDATE`).bind(roundId));
    if (!round) throw new UserError("Round not found.", 404);
    if (!["closed", "scored", "revealed"].includes(round.state)) throw new UserError("Close the round before scoring it.", 409);
    if (round.state !== "closed") await assertScoresEditable(round.phase, tx);
    const answers = parseStrings(round.answersJson);
    if (answers.length !== 3) throw new UserError("The Boardroom Choices are missing.");
    const rows = await tx.run<{ teamId: string; choicesJson: string }>(db.prepare(
      "SELECT t.id AS teamId, COALESCE(s.choices_json, '[]') AS choicesJson FROM teams t LEFT JOIN submissions s ON s.team_id = t.id AND s.round_id = ? WHERE t.is_active = 1",
    ).bind(round.id));
    const timestamp = now();
    for (const row of rows.results) {
      // Re-scoring keeps any Master override in place.
      await tx.run(db.prepare(
        "INSERT INTO score_lines (id, team_id, round_id, phase, points, calculated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET phase = excluded.phase, points = excluded.points, calculated_at = excluded.calculated_at",
      ).bind(id(), row.teamId, round.id, round.phase, scoreSubmission(parseStrings(row.choicesJson), answers), timestamp));
    }
    await tx.run(db.prepare("UPDATE rounds SET state = 'scored', updated_at = ? WHERE id = ? AND state = 'closed'").bind(timestamp, round.id));
    return { round, scored: rows.results.length };
  });
  await audit(viewer.email, round.state === "closed" ? "round.score" : "round.rescore", round.id, { scored });
  return { scored };
}

/** Sets (or clears, with `points: null`) a Master correction to one team's round score. */
export async function overrideScore(viewer: Viewer, input: { roundId: string; teamId: string; points: number | null; reason: string }) {
  requireMaster(viewer);
  const round = await getRound(input.roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new UserError("Score the round before correcting it.", 409);
  await assertScoresEditable(round.phase);
  const reason = input.reason.trim();
  if (!reason) throw new UserError("Give a reason. It is recorded in the audit log.");
  if (input.points !== null && (!Number.isInteger(input.points) || input.points < 0 || input.points > 100)) throw new UserError("Points must be a whole number from 0 to 100.");
  const team = await database().prepare("SELECT id FROM teams WHERE id = ? AND is_active = 1").bind(input.teamId).first();
  if (!team) throw new UserError("Team not found or deactivated.", 404);
  await database().prepare(
    "INSERT INTO score_lines (id, team_id, round_id, phase, points, override_points, override_reason, overridden_by, calculated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET override_points = excluded.override_points, override_reason = excluded.override_reason, overridden_by = excluded.overridden_by",
  ).bind(id(), input.teamId, round.id, round.phase, input.points, input.points === null ? null : reason, input.points === null ? null : viewer.email, now()).run();
  await audit(viewer.email, input.points === null ? "score.override_cleared" : "score.override", round.id, { teamId: input.teamId, points: input.points, reason });
}

/** Operational run-book confirmation only: either Master may publish without a second-account approval. */
export async function confirmScoresGreen(viewer: Viewer, roundId: string) {
  requireMaster(viewer);
  const round = await getRound(roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new UserError("Score the round before confirming SCORES GREEN.", 409);
  await audit(viewer.email, "score.scores_green", round.id, { state: round.state });
}

// Larger than any round_order; must fit Postgres `integer`.
const ALL_ROUNDS = 2_147_483_647;

/**
 * Cumulative points per active team for one track, counting only rounds up to `uptoOrder`, so a republished
 * "After Round 1" board never includes Round 2 points.
 */
async function trackTotals(track: Phase | "audience", onlyTeams?: Set<string>, uptoOrder = ALL_ROUNDS): Promise<Total[]> {
  // The hamper counts every scored round; the practice round never counts anywhere.
  const phaseFilter = track === "audience" ? "AND s.phase <> 'trial'" : "AND s.phase = ?";
  const rows = await database().prepare(
    `SELECT t.id AS teamId, t.name AS name, COALESCE(SUM(COALESCE(s.override_points, s.points)), 0) AS score
     FROM teams t LEFT JOIN score_lines s ON s.team_id = t.id ${phaseFilter} AND s.round_id IN (SELECT id FROM rounds WHERE round_order <= ?)
     WHERE t.is_active = 1 GROUP BY t.id, t.name`,
  ).bind(...(track === "audience" ? [uptoOrder] : [track, uptoOrder])).all<Total>();
  let totals = rows.results;
  // Audience totals are raw cumulative points across every round; only the two finalists are excluded.
  if (track === "audience") {
    const finalists = await stageTeamIds("top2");
    totals = totals.filter((row) => !finalists.has(row.teamId));
  }
  return onlyTeams ? totals.filter((row) => onlyTeams.has(row.teamId)) : totals;
}

/** The pool each stage is decided from: Rounds 1–4 for the Top 2, Rounds 5–6 (scores reset) for the winner. */
async function stagePool(stage: Stage) {
  if (stage === "top2") return trackTotals("prelim");
  if (stage === "final") return trackTotals("final", await stageTeamIds("top2"));
  return trackTotals("audience");
}

/** The leaderboard a published round puts on screen: cumulative for its phase, up to and including that round. */
async function roundStandings(round: RoundRecord) {
  const limit = PUBLISH_LIMIT[round.phase];
  const short = round.title.split(" · ")[0];
  const pool = round.phase === "prelim"
    ? await trackTotals("prelim", undefined, round.roundOrder)
    : await trackTotals("final", await stageTeamIds("top2"), round.roundOrder);
  const label = round.phase === "final"
    ? `${round.roundOrder === SCHEDULE[SCHEDULE.length - 1][1] ? "Final" : "Stage"} scoreboard · After ${short}`
    : `After ${short} · Top ${limit}`;
  return { label, limit, entries: rankTeams(pool).filter((entry) => entry.rank <= limit) };
}

/** True once every stage round has been scored. Until then nothing from Rounds 5–6 may reach the projector. */
async function finalRoundsScored() {
  const pending = await database().prepare("SELECT id FROM rounds WHERE phase = 'final' AND state NOT IN ('scored', 'revealed') LIMIT 1").first();
  return !pending;
}

const STAGE_HELD = "The stage results stay hidden until after Round 6. Score both stage rounds first.";

/**
 * Marks a scored round published. A qualifier round also puts its cumulative standings on the projector; a stage round
 * only records its board, because the awards are the stage reveal. Republishing writes a fresh board.
 */
export async function publishRound(viewer: Viewer, roundId: string) {
  requireMaster(viewer);
  const round = await getRound(roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new UserError("Score the round before publishing it.", 409);
  // "Finish practice": the practice round never has a leaderboard. It is marked done and the screen goes back to welcome.
  if (round.phase === "trial") {
    await database().prepare("UPDATE rounds SET state = 'revealed', updated_at = ? WHERE id = ?").bind(now(), round.id).run();
    await setDisplayUnchecked({ mode: "idle" });
    await audit(viewer.email, "round.practice_finished", round.id, {});
    return { label: "Practice finished", entries: 0, onScreen: false };
  }
  const stage = round.phase === "final";
  if (stage && !(await finalRoundsScored())) throw new UserError(STAGE_HELD, 409);
  const { label, limit, entries } = await roundStandings(round);
  const db = database();
  const timestamp = now();
  const snapshotId = id();
  await db.batch([
    // Stage-round boards are kept for the record but can never reach the projector: the awards are the reveal.
    insertSnapshot(snapshotId, stage ? "stage-round" : "round", label, limit, entries, viewer.email, timestamp),
    db.prepare("UPDATE rounds SET state = 'revealed', updated_at = ? WHERE id = ?").bind(timestamp, round.id),
  ]);
  if (!stage) await setDisplayUnchecked({ mode: "standings", snapshotId });
  await audit(viewer.email, round.state === "revealed" ? "round.republish" : "round.publish", round.id, { label, entries: entries.length, onScreen: !stage });
  return { label, entries: entries.length, onScreen: !stage };
}

/**
 * Publishes the hamper race (every team outside the Top 2, raw Rounds 1–4) after Round 4. There is no end-of-game
 * board: the hamper is revealed in the awards.
 */
export async function publishAudienceStandings(viewer: Viewer, afterRoundId: "round-4") {
  requireMaster(viewer);
  const round = await getRound(afterRoundId);
  if (round.state !== "revealed") throw new UserError(`Publish ${round.title} before showing the hamper race.`, 409);
  if (!(await stageTeamIds("top2")).size) throw new UserError("Confirm the Top 2 before showing the hamper race.", 409);
  const entries = rankTeams(await trackTotals("audience", undefined, round.roundOrder)).filter((entry) => entry.rank <= 5);
  const label = "Chocolate hamper race · Top 5 after Round 4";
  const snapshotId = id();
  await database().batch([insertSnapshot(snapshotId, "audience", label, 5, entries, viewer.email, now())]);
  await setDisplayUnchecked({ mode: "standings", snapshotId });
  await audit(viewer.email, "audience.publish", afterRoundId, { label, entries: entries.length });
  return { label, entries: entries.length };
}

/**
 * Only "round" and "audience" boards are ever put on screen. "stage" (a qualification record) and "stage-round"
 * (a Round 5/6 board, which would spoil the awards) are kept for the record only.
 */
type SnapshotKind = "round" | "audience" | "stage" | "stage-round";
const ON_SCREEN_KINDS = "kind IN ('round', 'audience')";

function insertSnapshot(snapshotId: string, kind: SnapshotKind, label: string, limit: number, entries: Ranked[], actor: string, timestamp: string) {
  return database().prepare("INSERT INTO leaderboard_snapshots (id, kind, label, rank_limit, entries_json, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(snapshotId, kind, label, limit, JSON.stringify(toPublicEntries(entries)), timestamp, actor);
}

// ---------------------------------------------------------------- Qualification (Top 2, winner, chocolate hamper)

async function requireRevealed(phase: Phase, message: string) {
  const pending = await database().prepare("SELECT id FROM rounds WHERE phase = ? AND state <> 'revealed' LIMIT 1").bind(phase).first();
  if (pending) throw new UserError(message, 409);
}

/** The scores a stage is decided from must be final, and the Top 2 locks once the stage rounds start. */
async function assertStageDecidable(stage: Stage) {
  if (stage === "top2") {
    await requireRevealed("prelim", "Publish Rounds 1–4 first.");
    const started = await database().prepare("SELECT id FROM rounds WHERE phase = 'final' AND state <> 'draft' LIMIT 1").first();
    if (started) throw new UserError("The Top 2 is locked because the stage rounds have started.", 409);
    return;
  }
  if (!(await stageTeamIds("top2")).size) throw new UserError("Confirm the Top 2 first.", 409);
  if (!(await finalRoundsScored())) throw new UserError("Score both stage rounds first.", 409);
}

/**
 * Confirms a stage. If teams tied on score straddle the cutoff, nothing is written and the tie is returned:
 * the Master then runs a sudden death and calls again with its id (`suddenDeathId`), or with the Game Jury's
 * picks (`selectedTeamIds`) and a ruling note as a fallback.
 * Confirming never changes the projector, so a result can't appear before its reveal.
 */
export async function qualifyStage(viewer: Viewer, input: { stage: Stage; selectedTeamIds?: string[]; note?: string; suddenDeathId?: string }) {
  requireMaster(viewer);
  const { stage } = input;
  if (!Object.hasOwn(STAGES, stage)) throw new UserError("Unknown stage.");
  await assertStageDecidable(stage);

  const { places } = STAGES[stage];
  const ranked = rankTeams(await stagePool(stage));
  if (!ranked.length) throw new UserError("No teams are eligible for this stage.", 409);
  // A tied cutoff is decided by a sudden death on the tool (or, as a fallback, an audited Game Jury ruling).
  const tie = cutoffTie(ranked, places);
  let chosen: Ranked[];
  let note = String(input.note ?? "").trim();
  if (tie) {
    let picks = input.selectedTeamIds ?? [];
    if (input.suddenDeathId) {
      const decision = await suddenDeathDecision(input.suddenDeathId, stage);
      picks = decision.winners;
      note = decision.note;
    }
    if (!picks.length) return { needsRuling: true as const, tie };
    const tiedIds = new Set(tie.tied.map((entry) => entry.teamId));
    if (picks.length !== tie.slots || new Set(picks).size !== picks.length || picks.some((pick) => !tiedIds.has(pick))) throw new UserError(`Choose exactly ${tie.slots} of the tied teams.`);
    if (!note) throw new UserError("Record the Game Jury ruling.");
    chosen = [...tie.through, ...tie.tied.filter((entry) => picks.includes(entry.teamId))];
  } else {
    chosen = ranked.slice(0, places);
  }
  // The finale stage records both finalists: the winner as #1 and the other as #2.
  if (stage === "final") chosen = [...chosen, ...ranked.filter((entry) => !chosen.includes(entry))].slice(0, 2).map((entry, index) => ({ ...entry, rank: index + 1 }));

  const db = database();
  const timestamp = now();
  await db.batch([
    // Two Masters confirming at once queue here instead of colliding on the primary key.
    db.prepare("SELECT pg_advisory_xact_lock(hashtext(?))").bind(`qualify:${stage}`),
    db.prepare("DELETE FROM qualifications WHERE stage = ?").bind(stage),
    ...chosen.map((entry) => db.prepare("INSERT INTO qualifications (stage, team_id, rank, score, ruling_note, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(stage, entry.teamId, entry.rank, entry.score, tie ? note : null, viewer.email, timestamp)),
    ...(stage === "audience" ? [] : [insertSnapshot(id(), "stage", STAGES[stage].label, STAGES[stage].places, chosen, viewer.email, timestamp)]),
  ]);
  await audit(viewer.email, "stage.confirm", stage, { teams: chosen.map((entry) => entry.name), tied: tie?.tied.map((entry) => entry.name), ruling: tie ? note : undefined });
  return { needsRuling: false as const, chosen: chosen.length };
}

// ---------------------------------------------------------------- Projector display

async function setDisplayUnchecked(display: Display) {
  await database().prepare(
    "INSERT INTO event_settings (key, value, updated_at) VALUES ('display', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(JSON.stringify(display), now()).run();
}

async function getDisplayState(): Promise<{ display: Display; revision: string }> {
  const row = await database().prepare("SELECT value, updated_at AS updatedAt FROM event_settings WHERE key = 'display'").first<{ value: string; updatedAt: string }>();
  return {
    display: parseJson<Display>(row?.value, (parsed) => typeof parsed === "object" && parsed !== null && "mode" in parsed, { mode: "idle" }),
    // The settings write timestamp is an opaque, monotonically refreshed display version for polling clients.
    revision: row?.updatedAt ?? "0",
  };
}

/** The newest board a Master chose to publish (a qualifier round or the hamper race), never a stage result. */
async function latestPublishedSnapshotId() {
  const row = await database().prepare(`SELECT id FROM leaderboard_snapshots WHERE ${ON_SCREEN_KINDS} ORDER BY published_at DESC LIMIT 1`).first<{ id: string }>();
  return row?.id;
}

export async function setDisplay(viewer: Viewer, display: Display) {
  requireMaster(viewer);
  const step = "step" in display ? Number(display.step) : 0;
  if (!Number.isInteger(step) || step < 0) throw new UserError("Invalid step.");
  let next: Display;
  switch (display.mode) {
    case "idle":
      next = { mode: "idle" };
      break;
    case "standings":
      next = { mode: "standings", snapshotId: await latestPublishedSnapshotId() };
      break;
    case "question": {
      const round = await getRound(display.roundId);
      if (round.state === "draft") throw new UserError("Open the round before showing it.", 409);
      next = { mode: "question", roundId: round.id };
      break;
    }
    case "reveal": {
      const round = await getRound(display.roundId);
      if (round.state !== "scored" && round.state !== "revealed") throw new UserError("Score the round before revealing the Boardroom Choices.", 409);
      if (round.phase === "final" && !(await finalRoundsScored())) throw new UserError(STAGE_HELD, 409);
      next = { mode: "reveal", roundId: round.id, step: Math.min(step, LAST_REVEAL_STEP) };
      break;
    }
    case "qualifiers": {
      if (display.stage !== "top2") throw new UserError("Unknown stage.");
      const count = (await stageTeamIds(display.stage)).size;
      if (!count) throw new UserError("Confirm this stage before revealing it.", 409);
      next = { mode: "qualifiers", stage: display.stage, step: Math.min(step, count) };
      break;
    }
    case "awards":
      if (!(await stageTeamIds("final")).size) throw new UserError("Confirm the winner before showing the awards.", 409);
      if (step >= 1 && !(await stageTeamIds("audience")).size) throw new UserError("Confirm the chocolate hamper in Qualify & awards before revealing it.", 409);
      next = { mode: "awards", step: Math.min(step, 3) };
      break;
    case "sudden-death": {
      const record = await getSuddenDeath(display.id);
      if (step >= 1 && record.state === "open") throw new UserError("Close the sudden death before revealing the answer.", 409);
      next = { mode: "sudden-death", id: record.id, step: Math.min(step, 2) };
      break;
    }
    default:
      throw new UserError("Unknown display mode.");
  }
  await setDisplayUnchecked(next);
  await audit(viewer.email, "display.set", next.mode, next);
}

async function stageEntries(stage: Stage): Promise<PublicTeam[]> {
  const rows = await database().prepare(
    "SELECT q.team_id AS teamId, t.name, q.score, q.rank FROM qualifications q JOIN teams t ON t.id = q.team_id WHERE q.stage = ? ORDER BY q.rank, t.name",
  ).bind(stage).all<PublicTeam>();
  return toPublicEntries(rows.results);
}

/** The pinned board, or (for a display set before pinning existed) the newest published one. */
async function snapshotForDisplay(snapshotId: string | undefined) {
  const db = database();
  const columns = "label, entries_json AS entriesJson, published_at AS publishedAt";
  const snapshot = snapshotId
    ? await db.prepare(`SELECT ${columns} FROM leaderboard_snapshots WHERE id = ? AND ${ON_SCREEN_KINDS}`).bind(snapshotId).first<{ label: string; entriesJson: string; publishedAt: string }>()
    : await db.prepare(`SELECT ${columns} FROM leaderboard_snapshots WHERE ${ON_SCREEN_KINDS} ORDER BY published_at DESC LIMIT 1`).first<{ label: string; entriesJson: string; publishedAt: string }>();
  return {
    label: snapshot?.label ?? "Leaderboard",
    entries: toPublicEntries(parseJson<PublicTeam[]>(snapshot?.entriesJson, Array.isArray, [])),
    publishedAt: snapshot?.publishedAt ?? null,
  };
}

/** Everything the projector may show, plus the Master's soundtrack switches. */
export async function getPublicDisplay() {
  const [frame, audio] = await Promise.all([publicFrame(), getAudioSettings()]);
  return { ...frame, audio };
}

/** Never includes emails, submissions, or Boardroom Choices and sudden-death answers that have not been revealed. */
async function publicFrame() {
  // One wave for the ready check, the deadline settle and the screen state; then the lookups for that screen.
  const [ready, , { display, revision }] = await Promise.all([eventReady(), settleExpiredRounds(), getDisplayState()]);
  if (!ready) return { mode: "idle" as const, serverNow: now(), revision: "0" };
  const serverNow = now();
  if (display.mode === "standings") return { mode: "standings" as const, serverNow, revision, ...(await snapshotForDisplay(display.snapshotId)) };
  if (display.mode === "question" || display.mode === "reveal") {
    const [round, stageScored] = await Promise.all([findRound(display.roundId), finalRoundsScored()]);
    if (!round || round.state === "draft") return { mode: "idle" as const, serverNow, revision };
    if (display.mode === "question") return { mode: "question" as const, serverNow, revision, ...toPublicQuestion(round) };
    if (round.state !== "scored" && round.state !== "revealed") return { mode: "idle" as const, serverNow, revision };
    if (round.phase === "final" && !stageScored) return { mode: "idle" as const, serverNow, revision };
    return { mode: "reveal" as const, serverNow, revision, ...toPublicReveal(round, display.step) };
  }
  if (display.mode === "sudden-death") {
    const record = await findSuddenDeath(display.id);
    if (!record) return { mode: "idle" as const, serverNow, revision };
    const outcome = await suddenDeathOutcome(record);
    // Nothing beyond the question while answers are still open, whatever step was asked for.
    const step = record.state === "open" ? 0 : display.step;
    return { mode: "sudden-death" as const, serverNow, revision, ...toPublicSuddenDeath(record, step, outcome.teams, outcome.answeredIds, outcome.result.ranked, outcome.result.winners) };
  }
  if (display.mode === "qualifiers") {
    const entries = await stageEntries(display.stage);
    // Revealed from the bottom up: 5th first, 1st last.
    const ordered = [...entries].reverse();
    return { mode: "qualifiers" as const, serverNow, revision, stage: display.stage, label: STAGES[display.stage].label, total: entries.length, step: display.step, revealed: ordered.slice(0, display.step) };
  }
  if (display.mode === "awards") {
    const [finalists, audience] = await Promise.all([stageEntries("final"), stageEntries("audience")]);
    return {
      mode: "awards" as const,
      serverNow,
      revision,
      step: display.step,
      audienceChampion: display.step >= 1 ? audience[0] ?? null : undefined,
      runnerUp: display.step >= 2 ? finalists.find((entry) => entry.rank === 2) ?? null : undefined,
      winner: display.step >= 3 ? finalists.find((entry) => entry.rank === 1) ?? null : undefined,
    };
  }
  return { mode: "idle" as const, serverNow, revision };
}

// ---------------------------------------------------------------- Captain view

/** Everything one Captain may see: their own team, the current question without its answer key, their own answer. */
export async function getTeamState(team: TeamRecord) {
  // Two waves instead of a dozen sequential queries: settle and the screen state, then everything this team needs.
  const [, { display }] = await Promise.all([settleExpiredRounds(), getDisplayState()]);
  const [round, top2, submission, reveal, suddenDeath] = await Promise.all([
    getCurrentRound(),
    stageTeamIds("top2"),
    database().prepare(
      "SELECT round_id AS roundId, choices_json AS choicesJson, updated_at AS updatedAt FROM submissions WHERE team_id = ? AND round_id = (SELECT id FROM rounds WHERE state <> 'draft' ORDER BY round_order DESC LIMIT 1)",
    ).bind(team.id).first<{ roundId: string; choicesJson: string; updatedAt: string }>(),
    teamReveal(team.id, display),
    teamSuddenDeath(team.id, display),
  ]);
  const serverNow = now();
  const teamView = { name: team.name, tableNumber: team.tableNumber };
  if (!round) return { serverNow, team: teamView, round: null, submission: null as { choices: string[]; updatedAt: string } | null, standing: "official" as "official" | "playing-along", reveal: null as TeamReveal | null, suddenDeath };
  return {
    serverNow,
    team: teamView,
    round: toTeamRound(round),
    submission: submission && submission.roundId === round.id ? { choices: parseStrings(submission.choicesJson), updatedAt: submission.updatedAt } : null,
    standing: teamStanding(team.id, round.phase, top2),
    reveal,
    suddenDeath,
  };
}

/** The projector's current reveal from this team's point of view. Only what the public screen already shows, plus the team's own answer. */
async function teamReveal(teamId: string, display: Display): Promise<TeamReveal | null> {
  if (display.mode !== "reveal") return null;
  const db = database();
  const [round, stageScored, submission, score] = await Promise.all([
    findRound(display.roundId),
    finalRoundsScored(),
    db.prepare("SELECT choices_json AS choicesJson FROM submissions WHERE team_id = ? AND round_id = ?").bind(teamId, display.roundId).first<{ choicesJson: string }>(),
    db.prepare("SELECT COALESCE(override_points, points) AS points FROM score_lines WHERE team_id = ? AND round_id = ?").bind(teamId, display.roundId).first<{ points: number }>(),
  ]);
  if (!round || (round.state !== "scored" && round.state !== "revealed")) return null;
  if (round.phase === "final" && !stageScored) return null;
  return toTeamReveal(round, display.step, { choicesJson: submission?.choicesJson ?? null, points: score?.points ?? null });
}

/** Saves a Captain's ranking for `roundId`, which must be the round that is open right now. */
export async function submitForTeam(team: TeamRecord, roundId: string, choices: string[]) {
  if (!Array.isArray(choices) || choices.length !== 3 || new Set(choices).size !== 3) throw new UserError("Choose three different options in ranked order.");
  const db = database();
  const round = await db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE state = 'open' ORDER BY round_order LIMIT 1`).first<RoundRecord>();
  if (!round || !round.closesAt || Date.parse(round.closesAt) + SUBMIT_GRACE_MS <= Date.now()) throw new UserError("This round is closed.", 409);
  // A phone that missed a poll must never file the last round's ranking under the next question.
  if (round.id !== roundId) throw new UserError("That round has closed. The next question is now on your screen.", 409);
  const optionIds = parseOptions(round.optionsJson).map((option) => option.id);
  if (optionIds.length !== 6 || choices.some((choice) => !optionIds.includes(choice))) throw new UserError("Your selection contains an invalid option.");
  const timestamp = now();
  // The deadline (plus the in-flight grace) and state are re-checked inside the write, so nothing lands after the
  // round closes. FOR SHARE makes Close and Score wait for a save already in progress instead of racing it.
  const result = await db.prepare(
    `INSERT INTO submissions (id, team_id, round_id, choices_json, submitted_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rounds WHERE id = ? AND state = 'open' AND closes_at > ? FOR SHARE)
     ON CONFLICT(team_id, round_id) DO UPDATE SET choices_json = excluded.choices_json, updated_at = excluded.updated_at`,
  ).bind(id(), team.id, round.id, JSON.stringify(choices), timestamp, timestamp, round.id, graceCutoff()).run();
  if (!result.meta.changes) throw new UserError("This round is closed.", 409);
  // The answer is saved: a failed audit write must never turn that into an error on the Captain's screen.
  await audit(team.captainEmail, "submission.upsert", round.id, { teamId: team.id }).catch((error) => console.error("[audit] submission", error));
  return { roundId: round.id, updatedAt: timestamp };
}

/**
 * Captures a Master-entered answer when Wi-Fi/device recovery requires paper. The accepted time and reason are
 * retained in the audit log.
 */
export async function recordManualSubmission(viewer: Viewer, input: { roundId: string; teamId: string; choices: string[]; reason: string }) {
  requireMaster(viewer);
  const reason = input.reason.trim();
  if (!reason) throw new UserError("Give the reason for this manual entry. It is recorded in the audit log.");
  if (!Array.isArray(input.choices) || input.choices.length !== 3 || new Set(input.choices).size !== 3) throw new UserError("Choose three different options in ranked order.");
  const db = database();
  const team = await db.prepare("SELECT id, name FROM teams WHERE id = ? AND is_active = 1").bind(input.teamId).first<{ id: string; name: string }>();
  if (!team) throw new UserError("Team not found or deactivated.", 404);
  const timestamp = now();
  // Shares the round row lock with scoring: the entry either lands before the scores are calculated or is refused.
  await db.transaction(async (tx) => {
    const round = await tx.first<RoundRecord>(db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = ? FOR SHARE`).bind(input.roundId));
    if (!round) throw new UserError("Round not found.", 404);
    if (!["open", "paused", "closed"].includes(round.state)) throw new UserError("Manual answers can only be accepted before the round is scored.", 409);
    const optionIds = parseOptions(round.optionsJson).map((option) => option.id);
    if (optionIds.length !== 6 || input.choices.some((choice) => !optionIds.includes(choice))) throw new UserError("The manual entry contains an invalid option.");
    await tx.run(db.prepare(
      "INSERT INTO submissions (id, team_id, round_id, choices_json, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET choices_json = excluded.choices_json, updated_at = excluded.updated_at",
    ).bind(id(), team.id, round.id, JSON.stringify(input.choices), timestamp, timestamp));
  });
  await audit(viewer.email, "submission.paper_recorded", input.roundId, { teamId: team.id, teamName: team.name, choices: input.choices, reason, acceptedAt: timestamp });
  return { updatedAt: timestamp };
}

// ---------------------------------------------------------------- Sudden death (multiple choice, only the right answer counts)

const SUDDEN_DEATH_COLUMNS =
  "id, stage, question_key AS questionKey, question, options_json AS optionsJson, correct_option AS correctOption, team_ids_json AS teamIdsJson, slots, carried_json AS carriedJson, state, duration_seconds AS durationSeconds, opened_at AS openedAt, closes_at AS closesAt, created_at AS createdAt";

type PickRow = { suddenDeathId: string; teamId: string; choice: string; submittedAt: string };

async function findSuddenDeath(suddenDeathId: string) {
  return database().prepare(`SELECT ${SUDDEN_DEATH_COLUMNS} FROM sudden_deaths WHERE id = ?`).bind(suddenDeathId).first<SuddenDeathRecord>();
}

async function getSuddenDeath(suddenDeathId: string) {
  const record = await findSuddenDeath(suddenDeathId);
  if (!record) throw new UserError("Sudden death not found.", 404);
  return record;
}

/** The tied teams, who has answered, and the live result, from rows already loaded (no queries). */
function outcomeFrom(record: SuddenDeathRecord, names: Map<string, string>, rows: PickRow[]) {
  const teams = parseStrings(record.teamIdsJson).map((teamId) => ({ teamId, name: names.get(teamId) ?? "Unknown team" }));
  const answers = new Map(rows.map((row) => [row.teamId, { choice: row.choice, submittedAt: row.submittedAt }]));
  const result = resolvePicks(record.correctOption, teams.map((team) => ({ ...team, choice: answers.get(team.teamId)?.choice ?? null })), record.slots);
  return { teams, answers, answeredIds: new Set(answers.keys()), result, carried: parseStrings(record.carriedJson) };
}

async function suddenDeathOutcome(record: SuddenDeathRecord) {
  const db = database();
  const [teamRows, pickRows] = await Promise.all([
    db.prepare("SELECT id AS teamId, name FROM teams").all<{ teamId: string; name: string }>(),
    db.prepare("SELECT sudden_death_id AS suddenDeathId, team_id AS teamId, choice, submitted_at AS submittedAt FROM sudden_death_answers WHERE sudden_death_id = ?").bind(record.id).all<PickRow>(),
  ]);
  return outcomeFrom(record, new Map(teamRows.results.map((row) => [row.teamId, row.name])), pickRows.results);
}

/** The teams a closed sudden death sends through (with any carried from an earlier one) and the ruling note. */
async function suddenDeathDecision(suddenDeathId: string, stage: Stage) {
  const record = await getSuddenDeath(suddenDeathId);
  if (record.stage !== stage) throw new UserError("That sudden death was for a different award.");
  if (record.state === "open") throw new UserError("Close the sudden death before confirming its result.", 409);
  const { result, carried } = await suddenDeathOutcome(record);
  if (result.stillTied.length) throw new UserError("Still level after this sudden death. Run another question for the teams that are still tied.", 409);
  const correctText = parseOptions(record.optionsJson).find((option) => option.id === record.correctOption)?.text ?? "";
  return { winners: [...carried, ...result.winners], note: rulingNote(record.questionKey, record.correctOption, correctText, result.ranked) };
}

/** Exactly four non-empty options A–D and one of them marked correct. */
function checkSuddenDeathOptions(options: unknown, correct: unknown) {
  const list = Array.isArray(options) ? options.map((option) => String(option ?? "").trim().slice(0, 200)) : [];
  if (list.length !== SUDDEN_DEATH_LETTERS.length || list.some((text) => !text)) throw new UserError("Fill in all four options, A to D.");
  if (new Set(list.map((text) => text.toLowerCase())).size !== list.length) throw new UserError("The four options must all be different.");
  if (typeof correct !== "string" || !(SUDDEN_DEATH_LETTERS as readonly string[]).includes(correct)) throw new UserError("Choose which option (A–D) is correct.");
  return { options: SUDDEN_DEATH_LETTERS.map((letter, index) => ({ id: letter, text: list[index] })), correct };
}

/**
 * Starts a sudden death for a tied cutoff: only the tied teams answer, on their Captain devices, and the projector
 * switches to the question. With `previousId` it replays just the teams still level after that sudden death.
 */
export async function startSuddenDeath(viewer: Viewer, input: { stage: Stage; questionKey: string; question: string; options: string[]; correctOption: string; previousId?: string }) {
  requireMaster(viewer);
  await settleExpiredRounds();
  const { stage } = input;
  if (!Object.hasOwn(STAGES, stage)) throw new UserError("Unknown stage.");
  await assertStageDecidable(stage);
  const question = input.question.trim().slice(0, 500);
  const questionKey = input.questionKey.trim().slice(0, 20) || "SD";
  if (!question) throw new UserError("Enter the sudden-death question.");
  const { options, correct } = checkSuddenDeathOptions(input.options, input.correctOption);
  const db = database();
  if (await db.prepare("SELECT id FROM sudden_deaths WHERE state = 'open' LIMIT 1").first()) throw new UserError("Another sudden death is still open. Close it first.", 409);
  if (await db.prepare("SELECT id FROM rounds WHERE state IN ('open', 'paused') LIMIT 1").first()) throw new UserError("A round is still running. Close it before starting a sudden death.", 409);

  let teamIds: string[];
  let slots: number;
  let carried: string[] = [];
  if (input.previousId) {
    const previous = await getSuddenDeath(input.previousId);
    if (previous.stage !== stage) throw new UserError("That sudden death was for a different award.");
    if (previous.state === "open") throw new UserError("Close the current sudden death first.", 409);
    const outcome = await suddenDeathOutcome(previous);
    if (!outcome.result.stillTied.length) throw new UserError("That sudden death already has a result.", 409);
    teamIds = outcome.result.stillTied;
    slots = outcome.result.slotsLeft;
    carried = [...outcome.carried, ...outcome.result.winners];
  } else {
    const tie = cutoffTie(rankTeams(await stagePool(stage)), STAGES[stage].places);
    if (!tie) throw new UserError("There is no tie at this cutoff, so no sudden death is needed.", 409);
    teamIds = tie.tied.map((entry) => entry.teamId);
    slots = tie.slots;
  }

  const suddenDeathId = id();
  const timestamp = now();
  const closesAt = new Date(Date.now() + SUDDEN_DEATH_SECONDS * 1000).toISOString();
  // The unique index on open sudden deaths turns a double click (or two Masters) into a clear message, not two questions.
  await db.prepare(
    "INSERT INTO sudden_deaths (id, stage, question_key, question, options_json, correct_option, team_ids_json, slots, carried_json, state, duration_seconds, opened_at, closes_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)",
  ).bind(suddenDeathId, stage, questionKey, question, JSON.stringify(options), correct, JSON.stringify(teamIds), slots, JSON.stringify(carried), SUDDEN_DEATH_SECONDS, timestamp, closesAt, viewer.email, timestamp).run()
    .catch((error: unknown) => {
      if (error instanceof Error && error.message.includes("sudden_deaths_one_open")) throw new UserError("Another sudden death is still open. Close it first.", 409);
      throw error;
    });
  await setDisplayUnchecked({ mode: "sudden-death", id: suddenDeathId, step: 0 });
  await audit(viewer.email, "sudden_death.start", suddenDeathId, { stage, questionKey, correct, teamIds, slots, carried, previousId: input.previousId });
  return { id: suddenDeathId, closesAt };
}

export async function closeSuddenDeath(viewer: Viewer, suddenDeathId: string) {
  requireMaster(viewer);
  const timestamp = now();
  const result = await database().prepare("UPDATE sudden_deaths SET state = 'closed', closes_at = ? WHERE id = ? AND state = 'open'").bind(timestamp, suddenDeathId).run();
  if (!result.meta.changes) throw new UserError("This sudden death is not open.", 409);
  await audit(viewer.email, "sudden_death.close", suddenDeathId, {});
}

function checkChoice(record: SuddenDeathRecord, value: unknown) {
  const choice = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!parseOptions(record.optionsJson).some((option) => option.id === choice)) throw new UserError("Choose one of the four options.");
  return choice;
}

/** Saves a tied team's pick. Only while the sudden death is open (plus the in-flight grace); re-checked inside the write. */
export async function submitSuddenDeath(team: TeamRecord, suddenDeathId: string, raw: unknown) {
  const record = await findSuddenDeath(suddenDeathId);
  if (!record || record.state !== "open" || Date.parse(record.closesAt) + SUBMIT_GRACE_MS <= Date.now()) throw new UserError("This sudden death is closed.", 409);
  if (!parseStrings(record.teamIdsJson).includes(team.id)) throw new UserError("Only the tied teams answer this sudden death.", 403);
  const choice = checkChoice(record, raw);
  const timestamp = now();
  const result = await database().prepare(
    "INSERT INTO sudden_death_answers (sudden_death_id, team_id, choice, submitted_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sudden_deaths WHERE id = ? AND state = 'open' AND closes_at > ?) ON CONFLICT (sudden_death_id, team_id) DO UPDATE SET choice = excluded.choice, submitted_at = excluded.submitted_at",
  ).bind(record.id, team.id, choice, timestamp, record.id, graceCutoff()).run();
  if (!result.meta.changes) throw new UserError("This sudden death is closed.", 409);
  await audit(team.captainEmail, "sudden_death.answer", record.id, { teamId: team.id }).catch((error) => console.error("[audit] sudden death", error));
  return { choice, submittedAt: timestamp };
}

/** A Master-entered pick, e.g. when a device fails on stage. Audited with its reason. */
export async function recordManualSuddenDeath(viewer: Viewer, input: { suddenDeathId: string; teamId: string; choice: string; reason: string }) {
  requireMaster(viewer);
  const reason = input.reason.trim();
  if (!reason) throw new UserError("Give the reason for this manual entry. It is recorded in the audit log.");
  const record = await getSuddenDeath(input.suddenDeathId);
  if (!parseStrings(record.teamIdsJson).includes(input.teamId)) throw new UserError("That team is not in this sudden death.");
  const choice = checkChoice(record, input.choice);
  await database().prepare(
    "INSERT INTO sudden_death_answers (sudden_death_id, team_id, choice, submitted_at) VALUES (?, ?, ?, ?) ON CONFLICT (sudden_death_id, team_id) DO UPDATE SET choice = excluded.choice, submitted_at = excluded.submitted_at",
  ).bind(record.id, input.teamId, choice, now()).run();
  await audit(viewer.email, "sudden_death.manual_answer", record.id, { teamId: input.teamId, choice, reason });
}

/** The sudden death a Captain should see: the one on the projector, or else the open one. */
async function teamSuddenDeath(teamId: string, display: Display) {
  const shownId = display.mode === "sudden-death" ? display.id : null;
  const record = shownId
    ? await findSuddenDeath(shownId)
    : await database().prepare(`SELECT ${SUDDEN_DEATH_COLUMNS} FROM sudden_deaths WHERE state = 'open' ORDER BY created_at DESC LIMIT 1`).first<SuddenDeathRecord>();
  if (!record) return null;
  const playing = parseStrings(record.teamIdsJson).includes(teamId);
  const step = display.mode === "sudden-death" && display.id === record.id ? (record.state === "open" ? 0 : display.step) : null;
  let own: string | null = null;
  let won: boolean | null = null;
  if (playing) {
    const row = await database().prepare("SELECT choice FROM sudden_death_answers WHERE sudden_death_id = ? AND team_id = ?").bind(record.id, teamId).first<{ choice: string }>();
    own = row?.choice ?? null;
    if (step !== null && step >= 2) won = (await suddenDeathOutcome(record)).result.winners.includes(teamId);
  }
  return toTeamSuddenDeath(record, step, playing, own, won);
}

// ---------------------------------------------------------------- Projector soundtrack

const DEFAULT_AUDIO: AudioSettings = { music: true, sfx: true };

async function getAudioSettings(): Promise<AudioSettings> {
  const row = await database().prepare("SELECT value FROM event_settings WHERE key = 'audio'").first<{ value: string }>();
  const parsed = parseJson<Partial<AudioSettings>>(row?.value, (value) => typeof value === "object" && value !== null, {});
  return { music: parsed.music ?? DEFAULT_AUDIO.music, sfx: parsed.sfx ?? DEFAULT_AUDIO.sfx };
}

/** Lets the emcee silence the music (or the effects) on the projector from the console, e.g. during the stage follow-up. */
export async function setAudioSettings(viewer: Viewer, settings: AudioSettings) {
  requireMaster(viewer);
  const value = { music: Boolean(settings.music), sfx: Boolean(settings.sfx) };
  await database().prepare(
    "INSERT INTO event_settings (key, value, updated_at) VALUES ('audio', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(JSON.stringify(value), now()).run();
  await audit(viewer.email, "display.audio", "audio", value);
}

// ---------------------------------------------------------------- Master overview

type ScoreRow = { teamId: string; roundId: string; phase: string; points: number; overridePoints: number | null; overrideReason: string | null };
type OverviewTeam = TeamRecord & { lastSignInAt: string | null; activeSessions: number };

/** The same totals as `trackTotals`, from rows the overview already loaded (active teams only). */
function totalsFrom(teams: OverviewTeam[], lines: ScoreRow[], include: (line: ScoreRow) => boolean, onlyTeams?: Set<string>, exclude?: Set<string>): Total[] {
  const sums = new Map<string, number>();
  for (const line of lines) if (include(line)) sums.set(line.teamId, (sums.get(line.teamId) ?? 0) + Number(line.overridePoints ?? line.points));
  return teams
    .filter((team) => Number(team.isActive) === 1 && (!onlyTeams || onlyTeams.has(team.id)) && !exclude?.has(team.id))
    .map((team) => ({ teamId: team.id, name: team.name, score: sums.get(team.id) ?? 0 }));
}

const EMAIL_ACTIONS = "'captain.code_requested', 'captain.access_sent', 'master.code_requested'";

/**
 * The Master console's state, in one parallel wave. `auditLimit` keeps the 3-second poll small; the Audit tab asks
 * for the long version.
 */
export async function getMasterOverview({ auditLimit = 60 }: { auditLimit?: number } = {}) {
  await settleExpiredRounds();
  const db = database();
  const currentRound = `(SELECT id FROM rounds WHERE state <> 'draft' ORDER BY round_order DESC LIMIT 1)`;
  const [teamRows, roundRows, submissionCounts, currentSubmissions, scoreRows, qualificationRows, auditRows, lastEmail, displayLinkRows, lockedEmails, display, audio, suddenDeathRows, pickRows] = await Promise.all([
    db.prepare("SELECT t.id, t.name, t.table_number AS tableNumber, t.captain_name AS captainName, t.captain_email AS captainEmail, t.is_active AS isActive, t.last_sign_in_at AS lastSignInAt, (SELECT COUNT(*) FROM captain_sessions s WHERE s.team_id = t.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS activeSessions FROM teams t ORDER BY t.name").bind(now()).all<OverviewTeam>(),
    db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds ORDER BY round_order`).all<RoundRecord>(),
    db.prepare("SELECT s.round_id AS roundId, COUNT(*) AS count FROM submissions s JOIN teams t ON t.id = s.team_id WHERE t.is_active = 1 GROUP BY s.round_id").all<{ roundId: string; count: number }>(),
    db.prepare(`SELECT team_id AS teamId, updated_at AS updatedAt FROM submissions WHERE round_id = ${currentRound}`).all<{ teamId: string; updatedAt: string }>(),
    db.prepare("SELECT team_id AS teamId, round_id AS roundId, phase, points, override_points AS overridePoints, override_reason AS overrideReason FROM score_lines").all<ScoreRow>(),
    db.prepare("SELECT q.stage, q.team_id AS teamId, t.name, q.rank, q.score, q.ruling_note AS rulingNote, q.decided_by AS decidedBy, q.decided_at AS decidedAt FROM qualifications q JOIN teams t ON t.id = q.team_id ORDER BY q.stage, q.rank").all<{ stage: Stage; teamId: string; name: string; rank: number; score: number; rulingNote: string | null; decidedBy: string; decidedAt: string }>(),
    db.prepare("SELECT actor_email AS actorEmail, action, target, detail_json AS detailJson, created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT ?").bind(Math.min(Math.max(auditLimit, 1), 500)).all<{ actorEmail: string; action: string; target: string; detailJson: string; createdAt: string }>(),
    db.prepare(`SELECT detail_json AS detailJson FROM audit_log WHERE action IN (${EMAIL_ACTIONS}) ORDER BY created_at DESC LIMIT 1`).first<{ detailJson: string }>(),
    db.prepare("SELECT id, label, created_by AS createdBy, created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt FROM display_tokens ORDER BY created_at DESC LIMIT 20").all<{ id: string; label: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null }>(),
    overLimit(LOCK_PREFIX, 3600, OTP_LIMITS.failuresPerEmailPerHour),
    getDisplayState(),
    getAudioSettings(),
    db.prepare(`SELECT ${SUDDEN_DEATH_COLUMNS} FROM sudden_deaths ORDER BY created_at DESC LIMIT 10`).all<SuddenDeathRecord>(),
    db.prepare("SELECT sudden_death_id AS suddenDeathId, team_id AS teamId, choice, submitted_at AS submittedAt FROM sudden_death_answers WHERE sudden_death_id IN (SELECT id FROM sudden_deaths ORDER BY created_at DESC LIMIT 10)").all<PickRow>(),
  ]);
  const teams = teamRows.results;
  const rounds = roundRows.results;
  const lines = scoreRows.results;
  const qualifications = qualificationRows.results;
  const top2 = new Set(qualifications.filter((row) => row.stage === "top2").map((row) => row.teamId));
  const roundIds = new Set(rounds.map((round) => round.id));
  const counted = (line: ScoreRow) => roundIds.has(line.roundId);
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const suddenDeaths = suddenDeathRows.results.map((record) => {
    const outcome = outcomeFrom(record, names, pickRows.results.filter((row) => row.suddenDeathId === record.id));
    return {
      ...record,
      options: parseOptions(record.optionsJson),
      teams: outcome.teams.map((team) => ({ ...team, choice: outcome.answers.get(team.teamId)?.choice ?? null, submittedAt: outcome.answers.get(team.teamId)?.submittedAt ?? null })),
      result: outcome.result,
      carried: outcome.carried,
    };
  });
  return {
    serverNow: now(),
    currentRoundId: rounds.filter((round) => round.state !== "draft").at(-1)?.id ?? null,
    teams,
    rounds,
    masters: MASTER_EMAILS,
    submissionCounts: submissionCounts.results,
    currentSubmissions: currentSubmissions.results,
    scoreLines: lines,
    standings: {
      prelim: rankTeams(totalsFrom(teams, lines, (line) => counted(line) && line.phase === "prelim")),
      final: rankTeams(totalsFrom(teams, lines, (line) => counted(line) && line.phase === "final", top2)),
      audience: rankTeams(totalsFrom(teams, lines, (line) => counted(line) && line.phase !== "trial", undefined, top2)),
    },
    /** False when the stored rounds are an earlier schedule that "Upgrade schedule" should replace. */
    scheduleCurrent: scheduleMatches(rounds),
    suddenDeaths,
    /** Master-only: the sudden-death questions and their correct letters. */
    suddenDeathBank: SUDDEN_DEATH_BANK,
    audio,
    qualifications,
    audit: auditRows.results,
    /** Whether the most recent sign-in email failed to send. */
    emailFailing: parseJson<{ delivered?: boolean }>(lastEmail?.detailJson, (value) => typeof value === "object" && value !== null, {}).delivered === false,
    /** Emails locked out of sign-in by repeated wrong codes this hour. */
    lockedEmails,
    /** Projector links. Only their labels and dates; the keys themselves are never stored. */
    displayLinks: displayLinkRows.results,
    display: display.display,
  };
}

export type MasterOverview = Awaited<ReturnType<typeof getMasterOverview>>;
