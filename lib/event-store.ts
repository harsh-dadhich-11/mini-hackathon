import { env } from "cloudflare:workers";
import { cutoffTie, rankTeams, scoreSubmission, type Ranked, type Total } from "@/lib/scoring";

export type Viewer = { email: string; displayName: string };
export type TeamRecord = {
  id: string;
  name: string;
  tableNumber: string;
  captainName: string;
  captainEmail: string;
  isActive: number;
};
export type Phase = "prelim" | "playoff" | "final";
export type RoundState = "draft" | "open" | "paused" | "closed" | "scored" | "revealed";
export type RoundRecord = {
  id: string;
  roundOrder: number;
  title: string;
  phase: Phase;
  durationSeconds: number;
  scenario: string;
  optionsJson: string;
  answersJson: string;
  evidenceJson: string;
  multiplier: number;
  state: RoundState;
  openedAt: string | null;
  closesAt: string | null;
  pausedRemainingMs: number | null;
};
export type Option = { id: string; text: string };
export type Stage = "top5" | "top2" | "final" | "audience";
export type Display =
  | { mode: "idle" }
  | { mode: "standings" }
  | { mode: "question"; roundId: string }
  | { mode: "reveal"; roundId: string; step: number }
  | { mode: "qualifiers"; stage: "top5" | "top2"; step: number }
  | { mode: "awards"; step: number };

/** Places available at each stage. Every answer is retained; qualification is calculated separately. */
export const STAGES: Record<Stage, { places: number; track: Phase | "audience"; label: string }> = {
  top5: { places: 5, track: "prelim", label: "Top 5 · Official scorecard" },
  top2: { places: 2, track: "playoff", label: "Top 2 · Finalists" },
  final: { places: 1, track: "final", label: "Final result" },
  audience: { places: 1, track: "audience", label: "Audience Champion" },
};

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export const normaliseEmail = (email: string) => email.trim().toLowerCase();
const MAX_TEAMS = 30;

const ROUND_COLUMNS =
  "id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, evidence_json AS evidenceJson, multiplier, state, opened_at AS openedAt, closes_at AS closesAt, paused_remaining_ms AS pausedRemainingMs";

const V4_ROUNDS = [
  ["round-1", 1, "Round 1 · Business Pressure", "prelim", 360, 1],
  ["round-2", 2, "Round 2 · Talent Bomb", "prelim", 360, 1],
  ["round-3", 3, "Round 3 · Client Escalation", "prelim", 360, 1],
  ["round-4", 4, "Round 4 · AI Disruption", "playoff", 360, 1],
  ["round-5", 5, "Round 5 · Security Incident", "final", 360, 1],
  ["round-6", 6, "Round 6 · The Acquisition", "final", 360, 1],
] as const;

export function database(): D1Database {
  if (!env.DB) throw new Error("Event storage is unavailable.");
  return env.DB;
}

export async function audit(actor: string, action: string, target: string, detail: unknown) {
  await database().prepare(
    "INSERT INTO audit_log (id, actor_email, action, target, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id(), actor, action, target, JSON.stringify(detail), now()).run();
}

function parseJson<T>(value: string | null | undefined, valid: (parsed: unknown) => boolean, fallback: T): T {
  try {
    const parsed = JSON.parse(value ?? "") as unknown;
    return valid(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

const parseOptions = (value: string) =>
  parseJson<Option[]>(value, (parsed) => Array.isArray(parsed) && parsed.every((item) => typeof item === "object" && item !== null && "id" in item && "text" in item), []);
const parseStrings = (value: string) =>
  parseJson<string[]>(value, (parsed) => Array.isArray(parsed) && parsed.every((item) => typeof item === "string"), []);

function friendlyConstraintError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("teams.captain_email") || message.includes("teams_captain_email_unique")) throw new Error("That Captain email is already assigned to another team.");
  if (message.includes("teams.name") || message.includes("teams_name_unique")) throw new Error("Another team already has that name.");
  throw error;
}

// ---------------------------------------------------------------- Masters & setup

export async function hasMasters() {
  const row = await database().prepare("SELECT COUNT(*) AS count FROM masters").first<{ count: number }>();
  return Boolean(row?.count);
}

/** Captain and public-display services stay dormant until both Masters and the complete 30-team roster exist. */
export async function eventReady() {
  const [mastersCount, teamsCount] = await database().batch([
    database().prepare("SELECT COUNT(*) AS count FROM masters"),
    database().prepare("SELECT COUNT(*) AS count FROM teams WHERE is_active = 1"),
  ]);
  return Number((mastersCount.results[0] as { count: number } | undefined)?.count ?? 0) === 2
    && Number((teamsCount.results[0] as { count: number } | undefined)?.count ?? 0) === MAX_TEAMS;
}

export async function isMaster(email: string) {
  const master = await database().prepare("SELECT email FROM masters WHERE email = ?").bind(normaliseEmail(email)).first();
  return Boolean(master);
}

export async function requireMaster(viewer: Viewer) {
  if (!(await isMaster(viewer.email))) throw new Error("Master access is required.");
}

export async function bootstrapEvent(viewer: Viewer) {
  if (await hasMasters()) throw new Error("The event has already been configured.");
  const db = database();
  const timestamp = now();
  const rounds = V4_ROUNDS;
  await db.batch([
    db.prepare("INSERT INTO masters (email, display_name, added_at) VALUES (?, ?, ?)").bind(normaliseEmail(viewer.email), viewer.displayName, timestamp),
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("event_name", "Boardroom Challenge", timestamp),
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("display", JSON.stringify({ mode: "idle" }), timestamp),
    ...rounds.map(([roundId, roundOrder, title, phase, durationSeconds, multiplier]) =>
      db.prepare("INSERT INTO rounds (id, round_order, title, phase, duration_seconds, multiplier, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
        .bind(roundId, roundOrder, title, phase, durationSeconds, multiplier, timestamp, timestamp),
    ),
  ]);
  await audit(viewer.email, "event.bootstrap", "event", { rounds: rounds.length });
}

/** Explicit safe upgrade path for an unused earlier prototype; it never discards game activity. */
export async function upgradeEventToV4(viewer: Viewer) {
  await requireMaster(viewer);
  const db = database();
  const [existingRounds, activity] = await db.batch([
    db.prepare("SELECT id FROM rounds ORDER BY round_order"),
    db.prepare("SELECT (SELECT COUNT(*) FROM submissions) + (SELECT COUNT(*) FROM score_lines) + (SELECT COUNT(*) FROM qualifications) AS count"),
  ]);
  const ids = existingRounds.results.map((row) => (row as { id: string }).id);
  if (ids.length === V4_ROUNDS.length && ids.every((roundId, index) => roundId === V4_ROUNDS[index][0])) return { upgraded: false };
  if (Number((activity.results[0] as { count: number } | undefined)?.count ?? 0) > 0) throw new Error("This event has gameplay data. Do not replace its schedule; create a new event instead.");
  const timestamp = now();
  await db.batch([
    db.prepare("DELETE FROM leaderboard_snapshots"),
    db.prepare("DELETE FROM rounds"),
    ...V4_ROUNDS.map(([roundId, roundOrder, title, phase, durationSeconds, multiplier]) =>
      db.prepare("INSERT INTO rounds (id, round_order, title, phase, duration_seconds, multiplier, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
        .bind(roundId, roundOrder, title, phase, durationSeconds, multiplier, timestamp, timestamp),
    ),
  ]);
  await setDisplayUnchecked({ mode: "idle" });
  await audit(viewer.email, "event.v4_upgrade", "event", { replacedRoundIds: ids, rounds: V4_ROUNDS.length });
  return { upgraded: true };
}

export async function addMaster(viewer: Viewer, email: string, displayName: string) {
  await requireMaster(viewer);
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail || !displayName.trim()) throw new Error("A name and email are required.");
  const db = database();
  const [captain, existing, count] = await db.batch([
    db.prepare("SELECT id FROM teams WHERE captain_email = ?").bind(cleanEmail),
    db.prepare("SELECT email FROM masters WHERE email = ?").bind(cleanEmail),
    db.prepare("SELECT COUNT(*) AS count FROM masters"),
  ]);
  if (captain.results.length) throw new Error("A Master email cannot also be assigned to a Captain.");
  if (!existing.results.length && Number((count.results[0] as { count: number } | undefined)?.count ?? 0) >= 2) throw new Error("Exactly two Master accounts are allowed.");
  await db.prepare(
    "INSERT INTO masters (email, display_name, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name",
  ).bind(cleanEmail, displayName.trim(), now()).run();
  await audit(viewer.email, "master.upsert", cleanEmail, { displayName: displayName.trim() });
}

// ---------------------------------------------------------------- Teams

type TeamInput = { name: string; tableNumber: string; captainName: string; captainEmail: string };

function cleanTeam(input: TeamInput) {
  const team = { name: input.name.trim(), tableNumber: input.tableNumber.trim(), captainName: input.captainName.trim(), captainEmail: normaliseEmail(input.captainEmail) };
  if (!team.name || !team.tableNumber || !team.captainName || !team.captainEmail) throw new Error("Team name, table number, Captain name and Captain email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(team.captainEmail)) throw new Error(`"${team.captainEmail}" is not a valid email address.`);
  return team;
}

async function insertTeam(viewer: Viewer, input: TeamInput) {
  const team = cleanTeam(input);
  const master = await database().prepare("SELECT email FROM masters WHERE email = ?").bind(team.captainEmail).first();
  if (master) throw new Error("A Captain email cannot also be assigned to a Master.");
  const teamId = id();
  const result = await database().prepare(
    "INSERT INTO teams (id, name, table_number, captain_name, captain_email, is_active, created_at) SELECT ?, ?, ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM teams WHERE is_active = 1) < ?",
  ).bind(teamId, team.name, team.tableNumber, team.captainName, team.captainEmail, now(), MAX_TEAMS).run().catch(friendlyConstraintError);
  if (!result.meta.changes) throw new Error(`The event already has ${MAX_TEAMS} active teams.`);
  await audit(viewer.email, "team.create", teamId, { name: team.name, captainEmail: team.captainEmail });
}

export async function addTeam(viewer: Viewer, input: TeamInput) {
  await requireMaster(viewer);
  await insertTeam(viewer, input);
}

/** One team per line: name, table, Captain name, Captain email. A header line containing "email" is skipped. */
export async function importTeams(viewer: Viewer, csv: string) {
  await requireMaster(viewer);
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]?.toLowerCase().includes("email")) lines.shift();
  let added = 0;
  const errors: string[] = [];
  for (const [index, line] of lines.entries()) {
    const [name = "", tableNumber = "", captainName = "", captainEmail = ""] = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    try {
      await insertTeam(viewer, { name, tableNumber, captainName, captainEmail });
      added += 1;
    } catch (error) {
      errors.push(`Line ${index + 1} (${name || "blank"}): ${error instanceof Error ? error.message : "could not be added"}`);
    }
  }
  return { added, errors };
}

/** Changing the Captain email revokes every session signed in with the old one. */
export async function updateTeam(viewer: Viewer, input: TeamInput & { id: string; transfer?: boolean }) {
  await requireMaster(viewer);
  const db = database();
  const existing = await db.prepare("SELECT captain_email AS captainEmail FROM teams WHERE id = ?").bind(input.id).first<{ captainEmail: string }>();
  if (!existing) throw new Error("Team not found.");
  const team = cleanTeam(input);
  const master = await db.prepare("SELECT email FROM masters WHERE email = ?").bind(team.captainEmail).first();
  if (master) throw new Error("A Captain email cannot also be assigned to a Master.");
  const emailChanged = team.captainEmail !== existing.captainEmail;
  await db.batch([
    db.prepare("UPDATE teams SET name = ?, table_number = ?, captain_name = ?, captain_email = ? WHERE id = ?").bind(team.name, team.tableNumber, team.captainName, team.captainEmail, input.id),
    ...(emailChanged
      ? [
        db.prepare("UPDATE captain_sessions SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL").bind(now(), input.id),
        db.prepare("DELETE FROM captain_codes WHERE email = ? AND used_at IS NULL").bind(existing.captainEmail),
      ]
      : []),
  ]).catch(friendlyConstraintError);
  await audit(viewer.email, emailChanged ? (input.transfer ? "captain.transfer" : "team.captain_replaced") : "team.update", input.id, { ...team, previousEmail: emailChanged ? existing.captainEmail : undefined });
}

export async function setTeamActive(viewer: Viewer, teamId: string, active: boolean) {
  await requireMaster(viewer);
  const db = database();
  if (active) {
    const result = await db.prepare("UPDATE teams SET is_active = 1 WHERE id = ? AND (SELECT COUNT(*) FROM teams WHERE is_active = 1) < ?").bind(teamId, MAX_TEAMS).run();
    if (!result.meta.changes) throw new Error(`The event already has ${MAX_TEAMS} active teams.`);
  } else {
    await db.batch([
      db.prepare("UPDATE teams SET is_active = 0 WHERE id = ?").bind(teamId),
      db.prepare("UPDATE captain_sessions SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL").bind(now(), teamId),
    ]);
  }
  await audit(viewer.email, active ? "team.activate" : "team.deactivate", teamId, {});
}

// ---------------------------------------------------------------- Rounds & timer

/** A round whose server deadline has passed is closed, even if no Master clicked Close. */
async function settleExpiredRounds() {
  const timestamp = now();
  await database().prepare("UPDATE rounds SET state = 'closed', updated_at = ? WHERE state = 'open' AND closes_at <= ?").bind(timestamp, timestamp).run();
}

async function getRound(roundId: string) {
  const round = await database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = ?`).bind(roundId).first<RoundRecord>();
  if (!round) throw new Error("Round not found.");
  return round;
}

/** The round teams and the projector care about: the latest one that has left draft. */
async function getCurrentRound() {
  return database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE state <> 'draft' ORDER BY round_order DESC LIMIT 1`).first<RoundRecord>();
}

type RoundInput = { id: string; title: string; scenario: string; options: Option[]; answers: string[]; evidence: string[]; durationSeconds: number; multiplier: number };

export async function updateRound(viewer: Viewer, input: RoundInput) {
  await requireMaster(viewer);
  const ids = input.options.map((option) => option.id);
  if (input.options.length !== 6 || new Set(ids).size !== 6 || input.answers.length !== 3 || new Set(input.answers).size !== 3 || input.answers.some((answer) => !ids.includes(answer))) {
    throw new Error("A round needs six distinct options and three ranked Boardroom Choices.");
  }
  if (!input.title.trim() || !input.scenario.trim() || input.options.some((option) => !option.text.trim())) {
    throw new Error("Add a title, scenario and text for every option before saving.");
  }
  if (input.durationSeconds !== 360) throw new Error("v4 uses the fixed 6:00 submission lock. Use the audited emergency Extend control only on game day.");
  if (input.multiplier !== 1) throw new Error("v4 uses the fixed 40/30/20 score model; the multiplier must be 1.");
  const evidence = [0, 1, 2].map((index) => String(input.evidence[index] ?? "").trim());
  const options = input.options.map((option) => ({ id: option.id, text: option.text.trim() }));
  const result = await database().prepare(
    "UPDATE rounds SET title = ?, scenario = ?, options_json = ?, answers_json = ?, evidence_json = ?, duration_seconds = ?, multiplier = ?, updated_at = ? WHERE id = ? AND state = 'draft'",
  ).bind(input.title.trim(), input.scenario.trim(), JSON.stringify(options), JSON.stringify(input.answers), JSON.stringify(evidence), input.durationSeconds, input.multiplier, now(), input.id).run();
  if (!result.meta.changes) throw new Error("Only draft rounds can be edited.");
  await audit(viewer.email, "round.update", input.id, { durationSeconds: input.durationSeconds, multiplier: input.multiplier });
}

/** Loads a question pack: an array of v4 rounds keyed by `id` (e.g. "round-1"). Fixed timing and scoring are retained when omitted. */
export async function importRounds(viewer: Viewer, items: unknown[]) {
  await requireMaster(viewer);
  const existing = (await database().prepare(`SELECT ${ROUND_COLUMNS} FROM rounds`).all<RoundRecord>()).results;
  let updated = 0;
  const errors: string[] = [];
  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const round = existing.find((candidate) => candidate.id === item.id);
    if (!round) { errors.push(`Unknown round id "${String(item.id)}".`); continue; }
    try {
      await updateRound(viewer, {
        id: round.id,
        title: String(item.title ?? round.title),
        scenario: String(item.scenario ?? ""),
        options: Array.isArray(item.options) ? (item.options as Option[]).map((option, index) => ({ id: String(option.id ?? String.fromCharCode(65 + index)), text: String(option.text ?? "") })) : [],
        answers: Array.isArray(item.answers) ? item.answers.map(String) : [],
        evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
        durationSeconds: Number(item.durationSeconds ?? round.durationSeconds),
        multiplier: Number(item.multiplier ?? round.multiplier),
      });
      updated += 1;
    } catch (error) {
      errors.push(`${round.id}: ${error instanceof Error ? error.message : "could not be saved"}`);
    }
  }
  return { updated, errors };
}

export type RoundControl = "open" | "pause" | "resume" | "extend" | "close";

export async function controlRound(viewer: Viewer, input: { action: RoundControl; roundId: string; seconds?: number; reason?: string }) {
  await requireMaster(viewer);
  await settleExpiredRounds();
  const db = database();
  const round = await getRound(input.roundId);
  const timestamp = now();
  const nowMs = Date.now();

  if (input.action === "open") {
    if (round.state !== "draft") throw new Error("A round can only be opened once.");
    if (!round.scenario || parseOptions(round.optionsJson).length !== 6 || parseStrings(round.answersJson).length !== 3) throw new Error("Load the scenario, six options and Boardroom Choices before opening this round.");
    const unfinished = await db.prepare("SELECT title FROM rounds WHERE round_order < ? AND state <> 'revealed' LIMIT 1").bind(round.roundOrder).first<{ title: string }>();
    if (unfinished) throw new Error(`Score and publish ${unfinished.title} before opening the next round.`);
    if (round.phase === "playoff" && !(await stageTeamIds("top5")).size) throw new Error("Confirm the Top 5 before opening Round 4.");
    if (round.phase === "final" && !(await stageTeamIds("top2")).size) throw new Error("Confirm the Top 2 before opening the stage rounds.");
    const closesAt = new Date(nowMs + round.durationSeconds * 1000).toISOString();
    await db.prepare("UPDATE rounds SET state = 'open', opened_at = ?, closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state = 'draft'")
      .bind(timestamp, closesAt, timestamp, round.id).run();
    await setDisplayUnchecked({ mode: "question", roundId: round.id });
    await audit(viewer.email, "round.open", round.id, { closesAt });
    return { closesAt };
  }

  if (input.action === "close") {
    const result = await db.prepare("UPDATE rounds SET state = 'closed', closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state IN ('open', 'paused')")
      .bind(timestamp, timestamp, round.id).run();
    if (!result.meta.changes) throw new Error("This round is not running.");
    await audit(viewer.email, "round.close", round.id, {});
    return {};
  }

  // Pause, resume and extend are emergency overrides: each needs a reason for the audit log.
  const reason = String(input.reason ?? "").trim();
  if (!reason) throw new Error("Give a reason. It is recorded in the audit log.");

  if (input.action === "pause") {
    const remainingMs = Math.max(0, Date.parse(round.closesAt ?? "") - nowMs);
    const result = await db.prepare("UPDATE rounds SET state = 'paused', paused_remaining_ms = ?, updated_at = ? WHERE id = ? AND state = 'open' AND closes_at > ?")
      .bind(remainingMs, timestamp, round.id, timestamp).run();
    if (!result.meta.changes) throw new Error("Only a running round can be paused.");
    await audit(viewer.email, "round.pause", round.id, { remainingMs, reason });
    return {};
  }

  if (input.action === "resume") {
    if (round.state !== "paused") throw new Error("This round is not paused.");
    const closesAt = new Date(nowMs + (round.pausedRemainingMs ?? 0)).toISOString();
    await db.prepare("UPDATE rounds SET state = 'open', closes_at = ?, paused_remaining_ms = NULL, updated_at = ? WHERE id = ? AND state = 'paused'")
      .bind(closesAt, timestamp, round.id).run();
    await audit(viewer.email, "round.resume", round.id, { closesAt, reason });
    return { closesAt };
  }

  const seconds = Number(input.seconds);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error("Extend by 10 to 600 seconds.");
  if (round.state === "paused") {
    await db.prepare("UPDATE rounds SET paused_remaining_ms = paused_remaining_ms + ?, updated_at = ? WHERE id = ?").bind(seconds * 1000, timestamp, round.id).run();
  } else if (round.state === "open" || round.state === "closed") {
    // A closed (but not yet scored) round reopens for `seconds`, for when the room needed more time.
    const base = round.state === "open" ? Math.max(nowMs, Date.parse(round.closesAt ?? "")) : nowMs;
    const later = await db.prepare("SELECT id FROM rounds WHERE round_order > ? AND state <> 'draft' LIMIT 1").bind(round.roundOrder).first();
    if (later) throw new Error("A later round has already started.");
    await db.prepare("UPDATE rounds SET state = 'open', closes_at = ?, updated_at = ? WHERE id = ?").bind(new Date(base + seconds * 1000).toISOString(), timestamp, round.id).run();
  } else {
    throw new Error("Scored rounds cannot be extended.");
  }
  await audit(viewer.email, round.state === "closed" ? "round.reopen" : "round.extend", round.id, { seconds, reason });
  return {};
}

// ---------------------------------------------------------------- Eligibility & scoring

async function stageTeamIds(stage: Stage) {
  const rows = await database().prepare("SELECT team_id AS teamId FROM qualifications WHERE stage = ?").bind(stage).all<{ teamId: string }>();
  return new Set(rows.results.map((row) => row.teamId));
}

/** A team can be outside the main game while still contributing every raw answer to the Audience Team race. */
function teamStanding(teamId: string, phase: Phase, top5: Set<string>, top2: Set<string>) {
  if (phase === "prelim") return "official" as const;
  if (phase === "playoff") return top5.has(teamId) ? "official" as const : "playing-along" as const;
  return top2.has(teamId) ? "official" as const : "playing-along" as const;
}

export async function scoreRound(viewer: Viewer, roundId: string) {
  await requireMaster(viewer);
  await settleExpiredRounds();
  const round = await getRound(roundId);
  if (!["closed", "scored", "revealed"].includes(round.state)) throw new Error("Close the round before scoring it.");
  const answers = parseStrings(round.answersJson);
  if (answers.length !== 3) throw new Error("The Boardroom Choices are missing.");
  const db = database();
  const rows = await db.prepare(
    "SELECT t.id AS teamId, COALESCE(s.choices_json, '[]') AS choicesJson FROM teams t LEFT JOIN submissions s ON s.team_id = t.id AND s.round_id = ? WHERE t.is_active = 1",
  ).bind(round.id).all<{ teamId: string; choicesJson: string }>();
  const timestamp = now();
  const writes: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    const points = scoreSubmission(parseStrings(row.choicesJson), answers);
    // Re-scoring keeps any Master override in place.
    writes.push(db.prepare(
      "INSERT INTO score_lines (id, team_id, round_id, phase, points, calculated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET phase = excluded.phase, points = excluded.points, calculated_at = excluded.calculated_at",
    ).bind(id(), row.teamId, round.id, round.phase, points, timestamp));
  }
  writes.push(db.prepare("UPDATE rounds SET state = 'scored', updated_at = ? WHERE id = ? AND state = 'closed'").bind(timestamp, round.id));
  await db.batch(writes);
  await audit(viewer.email, round.state === "closed" ? "round.score" : "round.rescore", round.id, { scored: writes.length - 1 });
  return { scored: writes.length - 1 };
}

/** Sets (or clears, with `points: null`) a Master correction to one team's round score. */
export async function overrideScore(viewer: Viewer, input: { roundId: string; teamId: string; points: number | null; reason: string }) {
  await requireMaster(viewer);
  const round = await getRound(input.roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new Error("Score the round before correcting it.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason. It is recorded in the audit log.");
  if (input.points !== null && (!Number.isInteger(input.points) || input.points < 0 || input.points > 100)) throw new Error("Points must be a whole number from 0 to 100.");
  const team = await database().prepare("SELECT id FROM teams WHERE id = ? AND is_active = 1").bind(input.teamId).first();
  if (!team) throw new Error("Team not found or deactivated.");
  const timestamp = now();
  await database().prepare(
    "INSERT INTO score_lines (id, team_id, round_id, phase, points, override_points, override_reason, overridden_by, calculated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET override_points = excluded.override_points, override_reason = excluded.override_reason, overridden_by = excluded.overridden_by",
  ).bind(id(), input.teamId, round.id, round.phase, input.points, input.points === null ? null : reason, input.points === null ? null : viewer.email, timestamp).run();
  await audit(viewer.email, input.points === null ? "score.override_cleared" : "score.override", round.id, { teamId: input.teamId, points: input.points, reason });
}

/** Operational run-book confirmation only: either Master may publish without a second-account approval. */
export async function confirmScoresGreen(viewer: Viewer, roundId: string) {
  await requireMaster(viewer);
  const round = await getRound(roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new Error("Score the round before confirming SCORES GREEN.");
  await audit(viewer.email, "score.scores_green", round.id, { state: round.state });
}

async function trackTotals(track: Phase | "audience", onlyTeams?: Set<string>): Promise<Total[]> {
  if (track === "audience") return audienceTotals(onlyTeams);
  const rows = await database().prepare(
    "SELECT t.id AS teamId, t.name AS name, COALESCE(SUM(COALESCE(s.override_points, s.points)), 0) AS score FROM teams t LEFT JOIN score_lines s ON s.team_id = t.id AND s.phase = ? WHERE t.is_active = 1 GROUP BY t.id, t.name",
  ).bind(track).all<Total>();
  return onlyTeams ? rows.results.filter((row) => onlyTeams.has(row.teamId)) : rows.results;
}

/** Audience totals are raw cumulative points across every round. Finalists are excluded only when awarding. */
async function audienceTotals(onlyTeams?: Set<string>): Promise<Total[]> {
  const rows = await database().prepare(
    "SELECT t.id AS teamId, t.name AS name, COALESCE(SUM(COALESCE(s.override_points, s.points)), 0) AS score FROM teams t LEFT JOIN score_lines s ON s.team_id = t.id WHERE t.is_active = 1 GROUP BY t.id, t.name",
  ).all<Total>();
  const finalists = await stageTeamIds("top2");
  return rows.results.filter((row) => !finalists.has(row.teamId) && (!onlyTeams || onlyTeams.has(row.teamId)));
}

/** The pool each stage is decided from. */
async function stagePool(stage: Stage) {
  if (stage === "top5") return trackTotals("prelim");
  if (stage === "top2") return trackTotals("playoff", await stageTeamIds("top5"));
  if (stage === "final") return trackTotals("final", await stageTeamIds("top2"));
  return trackTotals("audience");
}

export async function publishRound(viewer: Viewer, roundId: string) {
  await requireMaster(viewer);
  const round = await getRound(roundId);
  if (round.state !== "scored" && round.state !== "revealed") throw new Error("Score the round before publishing it.");
  let label: string | null = null;
  let limit = 0;
  let entries: Ranked[] = [];
  if (round.id === "round-1" || round.id === "round-2") {
    label = `After ${round.title.split(" · ")[0]} · Top 10`;
    limit = 10;
    entries = rankTeams(await trackTotals("prelim")).filter((entry) => entry.rank <= limit);
  } else if (round.id === "round-5" || round.id === "round-6") {
    label = round.id === "round-5" ? "Stage scoreboard · After Round 5" : "Final scoreboard · After Round 6";
    limit = 2;
    entries = rankTeams(await trackTotals("final", await stageTeamIds("top2"))).filter((entry) => entry.rank <= limit);
  }
  const db = database();
  const timestamp = now();
  await db.batch([
    ...(label ? [insertSnapshot(label, limit, entries, viewer.email, timestamp)] : []),
    db.prepare("UPDATE rounds SET state = 'revealed', updated_at = ? WHERE id = ?").bind(timestamp, round.id),
  ]);
  if (label) await setDisplayUnchecked({ mode: "standings" });
  await audit(viewer.email, round.state === "revealed" ? "round.republish" : "round.publish", round.id, { label, entries: entries.length });
  return { label, entries };
}

/** Publishes the separate Audience Team Top 5 after Round 4 or at the end of Round 6. */
export async function publishAudienceStandings(viewer: Viewer, afterRoundId: "round-4" | "round-6") {
  await requireMaster(viewer);
  const round = await getRound(afterRoundId);
  if (round.state !== "revealed") throw new Error(`Publish ${round.title} before showing the Audience Team standings.`);
  if (!(await stageTeamIds("top2")).size) throw new Error("Confirm the Top 2 before showing the Audience Team standings.");
  const entries = rankTeams(await stagePool("audience")).filter((entry) => entry.rank <= 5);
  const label = afterRoundId === "round-4" ? "Audience Team Top 5 · after Round 4" : "Audience Team final Top 5";
  const timestamp = now();
  await database().batch([
    insertSnapshot(label, 5, entries, viewer.email, timestamp),
  ]);
  await setDisplayUnchecked({ mode: "standings" });
  await audit(viewer.email, "audience.publish", afterRoundId, { label, entries: entries.length });
  return { label, entries };
}

function insertSnapshot(label: string, limit: number, entries: Ranked[], actor: string, timestamp: string) {
  const publicEntries = entries.map(({ teamId, name, score, rank }) => ({ teamId, name, score, rank }));
  return database().prepare("INSERT INTO leaderboard_snapshots (id, label, rank_limit, entries_json, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id(), label, limit, JSON.stringify(publicEntries), timestamp, actor);
}

// ---------------------------------------------------------------- Qualification (Top 5, Top 2, winner, Audience Champion)

async function requireRevealed(phase: Phase, message: string) {
  const pending = await database().prepare("SELECT id FROM rounds WHERE phase = ? AND state <> 'revealed' LIMIT 1").bind(phase).first();
  if (pending) throw new Error(message);
}

async function requireNotStarted(phase: Phase, stage: Stage) {
  const started = await database().prepare("SELECT id FROM rounds WHERE phase = ? AND state <> 'draft' LIMIT 1").bind(phase).first();
  if (started) throw new Error(`The ${stage === "top5" ? "Top 5" : "Top 2"} is locked because the next stage has started.`);
}

/**
 * Confirms a stage. If teams tied on score straddle the cutoff, nothing is written and the tie is returned:
 * the Master then calls again with the Game Jury's picks (`selectedTeamIds`) and a ruling note.
 */
export async function qualifyStage(viewer: Viewer, input: { stage: Stage; selectedTeamIds?: string[]; note?: string }) {
  await requireMaster(viewer);
  const { stage } = input;
  if (!(stage in STAGES)) throw new Error("Unknown stage.");
  if (stage === "top5") { await requireRevealed("prelim", "Publish Rounds 1–3 first."); await requireNotStarted("playoff", stage); }
  if (stage === "top2") { await requireRevealed("playoff", "Publish Round 4 first."); await requireNotStarted("final", stage); }
  if (stage === "final" || stage === "audience") await requireRevealed("final", "Publish both stage rounds first.");
  if (stage !== "top5" && !(await stageTeamIds("top5")).size) throw new Error("Confirm the Top 5 first.");

  const { places } = STAGES[stage];
  const ranked = rankTeams(await stagePool(stage));
  if (!ranked.length) throw new Error("No teams are eligible for this stage.");
  // Fifth-place ties qualify in full. The Top 2 and awards use an audited Master ruling when a cutoff is tied.
  const tie = stage === "top5" ? null : cutoffTie(ranked, places);
  let chosen: Ranked[];
  const note = String(input.note ?? "").trim();
  if (tie) {
    const picks = input.selectedTeamIds ?? [];
    if (!picks.length) return { needsRuling: true as const, tie };
    const tiedIds = new Set(tie.tied.map((entry) => entry.teamId));
    if (picks.length !== tie.slots || new Set(picks).size !== picks.length || picks.some((pick) => !tiedIds.has(pick))) throw new Error(`Choose exactly ${tie.slots} of the tied teams.`);
    if (!note) throw new Error("Record the Game Jury ruling.");
    chosen = [...tie.through, ...tie.tied.filter((entry) => picks.includes(entry.teamId))];
  } else {
    chosen = stage === "top5" ? ranked.filter((entry) => entry.rank <= places) : ranked.slice(0, places);
  }
  // The finale stage records both finalists: the winner as #1 and the other as #2.
  if (stage === "final") chosen = [...chosen, ...ranked.filter((entry) => !chosen.includes(entry))].slice(0, 2).map((entry, index) => ({ ...entry, rank: index + 1 }));

  const db = database();
  const timestamp = now();
  await db.batch([
    db.prepare("DELETE FROM qualifications WHERE stage = ?").bind(stage),
    ...chosen.map((entry) => db.prepare("INSERT INTO qualifications (stage, team_id, rank, score, ruling_note, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(stage, entry.teamId, entry.rank, entry.score, tie ? note : null, viewer.email, timestamp)),
    ...(stage === "audience" ? [] : [insertSnapshot(STAGES[stage].label, STAGES[stage].places, chosen, viewer.email, timestamp)]),
  ]);
  await audit(viewer.email, "stage.confirm", stage, { teams: chosen.map((entry) => entry.name), tied: tie?.tied.map((entry) => entry.name), ruling: tie ? note : undefined });
  return { needsRuling: false as const, chosen };
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

async function getDisplay(): Promise<Display> {
  return (await getDisplayState()).display;
}

export async function setDisplay(viewer: Viewer, display: Display) {
  await requireMaster(viewer);
  const step = "step" in display ? Number(display.step) : 0;
  if (!Number.isInteger(step) || step < 0) throw new Error("Invalid step.");
  let next: Display;
  switch (display.mode) {
    case "idle":
    case "standings":
      next = { mode: display.mode };
      break;
    case "question": {
      const round = await getRound(display.roundId);
      if (round.state === "draft") throw new Error("Open the round before showing it.");
      next = { mode: "question", roundId: round.id };
      break;
    }
    case "reveal": {
      const round = await getRound(display.roundId);
      if (round.state !== "scored" && round.state !== "revealed") throw new Error("Score the round before revealing the Boardroom Choices.");
      next = { mode: "reveal", roundId: round.id, step: Math.min(step, 3) };
      break;
    }
    case "qualifiers": {
      if (display.stage !== "top5" && display.stage !== "top2") throw new Error("Unknown stage.");
      const count = (await stageTeamIds(display.stage)).size;
      if (!count) throw new Error("Confirm this stage before revealing it.");
      next = { mode: "qualifiers", stage: display.stage, step: Math.min(step, count) };
      break;
    }
    case "awards":
      if (!(await stageTeamIds("final")).size) throw new Error("Confirm the winner before showing the awards.");
      next = { mode: "awards", step: Math.min(step, 3) };
      break;
    default:
      throw new Error("Unknown display mode.");
  }
  await setDisplayUnchecked(next);
  await audit(viewer.email, "display.set", next.mode, next);
}

type PublicTeam = { teamId: string; name: string; score: number; rank: number };

async function stageEntries(stage: Stage): Promise<PublicTeam[]> {
  const rows = await database().prepare(
    "SELECT q.team_id AS teamId, t.name, q.score, q.rank FROM qualifications q JOIN teams t ON t.id = q.team_id WHERE q.stage = ? ORDER BY q.rank, t.name",
  ).bind(stage).all<PublicTeam>();
  return rows.results;
}

async function latestSnapshot() {
  const snapshot = await database().prepare(
    "SELECT label, entries_json AS entriesJson, published_at AS publishedAt FROM leaderboard_snapshots ORDER BY published_at DESC LIMIT 1",
  ).first<{ label: string; entriesJson: string; publishedAt: string }>();
  return {
    label: snapshot?.label ?? "Leaderboard",
    entries: parseJson<PublicTeam[]>(snapshot?.entriesJson, Array.isArray, []),
    publishedAt: snapshot?.publishedAt ?? null,
  };
}

/** Everything the projector may show. Never includes emails, submissions, or Boardroom Choices that have not been revealed. */
export async function getPublicDisplay() {
  if (!(await eventReady())) return { mode: "idle" as const, serverNow: now(), revision: "0" };
  await settleExpiredRounds();
  const { display, revision } = await getDisplayState();
  const serverNow = now();
  if (display.mode === "standings") return { mode: "standings" as const, serverNow, revision, ...(await latestSnapshot()) };
  if (display.mode === "question" || display.mode === "reveal") {
    const round = await getRound(display.roundId).catch(() => null);
    if (!round || round.state === "draft") return { mode: "idle" as const, serverNow, revision };
    const base = { title: round.title, phase: round.phase, multiplier: round.multiplier, scenario: round.scenario, options: parseOptions(round.optionsJson) };
    if (display.mode === "question") {
      return { mode: "question" as const, serverNow, revision, ...base, state: round.state, closesAt: round.closesAt, pausedRemainingMs: round.pausedRemainingMs };
    }
    if (round.state !== "scored" && round.state !== "revealed") return { mode: "idle" as const, serverNow, revision };
    const answers = parseStrings(round.answersJson);
    const evidence = parseStrings(round.evidenceJson);
    // Step 1 shows #3, step 2 adds #2, step 3 adds #1.
    const revealed = [2, 1, 0].slice(0, display.step).map((index) => ({
      rank: index + 1,
      optionId: answers[index],
      text: base.options.find((option) => option.id === answers[index])?.text ?? "",
      evidence: evidence[index] ?? "",
    }));
    return { mode: "reveal" as const, serverNow, revision, ...base, step: display.step, revealed };
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

export async function getTeamState(team: TeamRecord) {
  await settleExpiredRounds();
  const round = await getCurrentRound();
  const serverNow = now();
  if (!round) return { serverNow, team: { name: team.name, tableNumber: team.tableNumber }, round: null, submission: null as { choices: string[]; updatedAt: string } | null, standing: "official" as "official" | "playing-along" };
  const [top5, top2, submission] = await Promise.all([
    stageTeamIds("top5"),
    stageTeamIds("top2"),
    database().prepare("SELECT choices_json AS choicesJson, updated_at AS updatedAt FROM submissions WHERE team_id = ? AND round_id = ?").bind(team.id, round.id).first<{ choicesJson: string; updatedAt: string }>(),
  ]);
  const standing = teamStanding(team.id, round.phase, top5, top2);
  return {
    serverNow,
    team: { name: team.name, tableNumber: team.tableNumber },
    // Deliberately no answers or evidence here.
    round: {
      id: round.id,
      title: round.title,
      phase: round.phase,
      multiplier: round.multiplier,
      scenario: round.scenario,
      options: parseOptions(round.optionsJson),
      state: round.state,
      closesAt: round.closesAt,
      pausedRemainingMs: round.pausedRemainingMs,
      inputMode: round.phase === "final" && top2.has(team.id) ? "master-paddle" as const : "captain" as const,
    },
    submission: submission ? { choices: parseStrings(submission.choicesJson), updatedAt: submission.updatedAt } : null,
    standing,
  };
}

export async function submitForTeam(team: TeamRecord, choices: string[]) {
  if (!Array.isArray(choices) || choices.length !== 3 || new Set(choices).size !== 3) throw new Error("Choose three different options in ranked order.");
  const db = database();
  const round = await db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE state = 'open' ORDER BY round_order LIMIT 1`).first<RoundRecord>();
  if (!round || !round.closesAt || Date.parse(round.closesAt) <= Date.now()) throw new Error("This round is closed.");
  if (round.phase === "final" && (await stageTeamIds("top2")).has(team.id)) throw new Error("Finalist choices are entered by a Master from the stage paddles.");
  const optionIds = parseOptions(round.optionsJson).map((option) => option.id);
  if (optionIds.length !== 6 || choices.some((choice) => !optionIds.includes(choice))) throw new Error("Your selection contains an invalid option.");
  const timestamp = now();
  // The deadline and state are re-checked inside the write, so nothing lands after the server closes the round.
  const result = await db.prepare(
    "INSERT INTO submissions (id, team_id, round_id, choices_json, submitted_at, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rounds WHERE id = ? AND state = 'open' AND closes_at > ?) ON CONFLICT(team_id, round_id) DO UPDATE SET choices_json = excluded.choices_json, updated_at = excluded.updated_at",
  ).bind(id(), team.id, round.id, JSON.stringify(choices), timestamp, timestamp, round.id, timestamp).run();
  if (!result.meta.changes) throw new Error("This round is closed.");
  await audit(team.captainEmail, "submission.upsert", round.id, { teamId: team.id });
  return { roundId: round.id, updatedAt: timestamp };
}

/**
 * Captures a Master-entered answer when Wi-Fi/device recovery requires paper, or when a finalist
 * gives a stage-paddle answer. The source, accepted time and reason are retained in the audit log.
 */
export async function recordManualSubmission(viewer: Viewer, input: { roundId: string; teamId: string; choices: string[]; source: "paper" | "paddle"; reason: string }) {
  await requireMaster(viewer);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give the reason for this manual entry. It is recorded in the audit log.");
  if (!Array.isArray(input.choices) || input.choices.length !== 3 || new Set(input.choices).size !== 3) throw new Error("Choose three different options in ranked order.");
  const [round, team] = await Promise.all([
    getRound(input.roundId),
    database().prepare("SELECT id, name FROM teams WHERE id = ? AND is_active = 1").bind(input.teamId).first<{ id: string; name: string }>(),
  ]);
  if (!team) throw new Error("Team not found or deactivated.");
  if (!["open", "paused", "closed"].includes(round.state)) throw new Error("Manual answers can only be accepted before the round is scored.");
  if (input.source === "paddle") {
    if (round.phase !== "final" || !(await stageTeamIds("top2")).has(team.id)) throw new Error("Paddle entry is only for a Top 2 finalist in Round 5 or Round 6.");
  }
  const optionIds = parseOptions(round.optionsJson).map((option) => option.id);
  if (optionIds.length !== 6 || input.choices.some((choice) => !optionIds.includes(choice))) throw new Error("The manual entry contains an invalid option.");
  const timestamp = now();
  await database().prepare(
    "INSERT INTO submissions (id, team_id, round_id, choices_json, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET choices_json = excluded.choices_json, updated_at = excluded.updated_at",
  ).bind(id(), team.id, round.id, JSON.stringify(input.choices), timestamp, timestamp).run();
  await audit(viewer.email, input.source === "paper" ? "submission.paper_recorded" : "submission.paddle_recorded", round.id, { teamId: team.id, teamName: team.name, choices: input.choices, reason, acceptedAt: timestamp });
  return { updatedAt: timestamp };
}

// ---------------------------------------------------------------- Master overview

export async function getMasterOverview() {
  await settleExpiredRounds();
  const db = database();
  const current = await getCurrentRound();
  const [teamRows, roundRows, masterRows, submissionCounts, currentSubmissions, scoreRows, qualificationRows, auditRows] = await db.batch([
    db.prepare("SELECT t.id, t.name, t.table_number AS tableNumber, t.captain_name AS captainName, t.captain_email AS captainEmail, t.is_active AS isActive, t.last_sign_in_at AS lastSignInAt, (SELECT COUNT(*) FROM captain_sessions s WHERE s.team_id = t.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS activeSessions FROM teams t ORDER BY t.name").bind(now()),
    db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds ORDER BY round_order`),
    db.prepare("SELECT email, display_name AS displayName FROM masters ORDER BY added_at"),
    db.prepare("SELECT round_id AS roundId, COUNT(*) AS count FROM submissions GROUP BY round_id"),
    db.prepare("SELECT team_id AS teamId, updated_at AS updatedAt FROM submissions WHERE round_id = ?").bind(current?.id ?? ""),
    db.prepare("SELECT team_id AS teamId, round_id AS roundId, phase, points, override_points AS overridePoints, override_reason AS overrideReason FROM score_lines"),
    db.prepare("SELECT q.stage, q.team_id AS teamId, t.name, q.rank, q.score, q.ruling_note AS rulingNote, q.decided_by AS decidedBy, q.decided_at AS decidedAt FROM qualifications q JOIN teams t ON t.id = q.team_id ORDER BY q.stage, q.rank"),
    db.prepare("SELECT actor_email AS actorEmail, action, target, detail_json AS detailJson, created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT 300"),
  ]);
  const [prelim, playoff, final, audience] = await Promise.all([stagePool("top5"), stagePool("top2"), stagePool("final"), stagePool("audience")]);
  return {
    serverNow: now(),
    currentRoundId: current?.id ?? null,
    teams: teamRows.results as unknown as (TeamRecord & { lastSignInAt: string | null; activeSessions: number })[],
    rounds: roundRows.results as unknown as RoundRecord[],
    masters: masterRows.results as unknown as { email: string; displayName: string }[],
    submissionCounts: submissionCounts.results as unknown as { roundId: string; count: number }[],
    currentSubmissions: currentSubmissions.results as unknown as { teamId: string; updatedAt: string }[],
    scoreLines: scoreRows.results as unknown as { teamId: string; roundId: string; phase: string; points: number; overridePoints: number | null; overrideReason: string | null }[],
    standings: { prelim: rankTeams(prelim), playoff: rankTeams(playoff), final: rankTeams(final), audience: rankTeams(audience) },
    qualifications: qualificationRows.results as unknown as { stage: Stage; teamId: string; name: string; rank: number; score: number; rulingNote: string | null; decidedBy: string; decidedAt: string }[],
    audit: auditRows.results as unknown as { actorEmail: string; action: string; target: string; detailJson: string; createdAt: string }[],
    display: await getDisplay(),
  };
}

export type MasterOverview = Awaited<ReturnType<typeof getMasterOverview>>;
