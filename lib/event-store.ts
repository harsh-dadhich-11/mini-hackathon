import { env } from "cloudflare:workers";

export type Viewer = { email: string; displayName: string };
export type TeamRecord = {
  id: string;
  name: string;
  tableNumber: string;
  captainName: string;
  captainEmail: string;
  isActive: number;
};
export type RoundRecord = {
  id: string;
  roundOrder: number;
  title: string;
  phase: "prelim" | "playoff" | "final";
  durationSeconds: number;
  scenario: string;
  optionsJson: string;
  answersJson: string;
  multiplier: number;
  state: "draft" | "open" | "closed" | "revealed";
  openedAt: string | null;
  closesAt: string | null;
};

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const normaliseEmail = (email: string) => email.trim().toLowerCase();

export function database(): D1Database {
  if (!env.DB) throw new Error("Event storage is unavailable.");
  return env.DB;
}

async function audit(actor: string, action: string, target: string, detail: unknown) {
  await database().prepare(
    "INSERT INTO audit_log (id, actor_email, action, target, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id(), actor, action, target, JSON.stringify(detail), now()).run();
}

export async function hasMasters() {
  const row = await database().prepare("SELECT COUNT(*) AS count FROM masters").first<{ count: number }>();
  return Boolean(row?.count);
}

export async function isMaster(email: string) {
  const master = await database().prepare("SELECT email FROM masters WHERE email = ?").bind(normaliseEmail(email)).first();
  return Boolean(master);
}

export async function bootstrapEvent(viewer: Viewer) {
  if (await hasMasters()) throw new Error("The event has already been configured.");
  const db = database();
  const timestamp = now();
  const rounds = [
    ["round-1", 1, "Round 1", "prelim", 480, 1],
    ["round-2", 2, "Round 2", "prelim", 480, 1],
    ["round-3", 3, "Round 3", "prelim", 480, 1],
    ["round-4", 4, "Round 4", "prelim", 480, 1],
    ["round-5", 5, "Round 5", "playoff", 540, 1],
    ["final-1", 6, "Finale Q1", "final", 330, 1],
    ["final-2", 7, "Finale Q2", "final", 330, 1],
    ["final-3", 8, "Finale Q3", "final", 330, 2],
    ["final-4", 9, "Finale Q4", "final", 330, 3],
  ];
  const statements = [
    db.prepare("INSERT INTO masters (email, display_name, added_at) VALUES (?, ?, ?)").bind(normaliseEmail(viewer.email), viewer.displayName, timestamp),
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("event_name", "Boardroom Challenge", timestamp),
    db.prepare("INSERT INTO event_settings (key, value, updated_at) VALUES (?, ?, ?)").bind("status", "setup", timestamp),
    ...rounds.map(([roundId, roundOrder, title, phase, durationSeconds, multiplier]) =>
      db.prepare("INSERT INTO rounds (id, round_order, title, phase, duration_seconds, multiplier, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
        .bind(roundId, roundOrder, title, phase, durationSeconds, multiplier, timestamp, timestamp),
    ),
  ];
  await db.batch(statements);
  await audit(viewer.email, "event.bootstrap", "event", { rounds: rounds.length });
}

export async function requireMaster(viewer: Viewer) {
  if (!(await isMaster(viewer.email))) throw new Error("Master access is required.");
}

export async function addMaster(viewer: Viewer, email: string, displayName: string) {
  await requireMaster(viewer);
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail || !displayName.trim()) throw new Error("A name and email are required.");
  await database().prepare(
    "INSERT INTO masters (email, display_name, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name",
  ).bind(cleanEmail, displayName.trim(), now()).run();
  await audit(viewer.email, "master.upsert", cleanEmail, { displayName: displayName.trim() });
}

export async function addTeam(viewer: Viewer, input: { name: string; tableNumber: string; captainName: string; captainEmail: string }) {
  await requireMaster(viewer);
  const cleanEmail = normaliseEmail(input.captainEmail);
  if (!input.name.trim() || !input.tableNumber.trim() || !input.captainName.trim() || !cleanEmail) {
    throw new Error("Team name, table number, Captain name and Captain email are required.");
  }
  const teamId = id();
  const result = await database().prepare(
    "INSERT INTO teams (id, name, table_number, captain_name, captain_email, is_active, created_at) SELECT ?, ?, ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM teams WHERE is_active = 1) < 30",
  ).bind(teamId, input.name.trim(), input.tableNumber.trim(), input.captainName.trim(), cleanEmail, now()).run();
  if (!result.meta.changes) throw new Error("The event already has 30 active teams.");
  await audit(viewer.email, "team.create", teamId, { name: input.name.trim(), captainEmail: cleanEmail });
}

export async function getTeamForCaptain(email: string) {
  return database().prepare(
    "SELECT id, name, table_number AS tableNumber, captain_name AS captainName, captain_email AS captainEmail, is_active AS isActive FROM teams WHERE captain_email = ? AND is_active = 1",
  ).bind(normaliseEmail(email)).first<TeamRecord>();
}

export async function getMasterOverview() {
  const db = database();
  const [teamRows, roundsRows, mastersRows, submissions] = await db.batch([
    db.prepare("SELECT id, name, table_number AS tableNumber, captain_name AS captainName, captain_email AS captainEmail, is_active AS isActive FROM teams ORDER BY name"),
    db.prepare("SELECT id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, multiplier, state, opened_at AS openedAt, closes_at AS closesAt FROM rounds ORDER BY round_order"),
    db.prepare("SELECT email, display_name AS displayName FROM masters ORDER BY added_at"),
    db.prepare("SELECT round_id AS roundId, COUNT(*) AS count FROM submissions GROUP BY round_id"),
  ]);
  return {
    teams: teamRows.results as unknown as TeamRecord[],
    rounds: roundsRows.results as unknown as RoundRecord[],
    masters: mastersRows.results as unknown as { email: string; displayName: string }[],
    submissions: submissions.results as unknown as { roundId: string; count: number }[],
  };
}

export async function getOpenRoundForTeam() {
  const round = await database().prepare(
    "SELECT id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, multiplier, state, opened_at AS openedAt, closes_at AS closesAt FROM rounds WHERE state = 'open' ORDER BY round_order LIMIT 1",
  ).first<RoundRecord>();
  if (!round) return null;
  const options = parseOptions(round.optionsJson);
  return { id: round.id, title: round.title, phase: round.phase, scenario: round.scenario, options, closesAt: round.closesAt };
}

function parseOptions(value: string): { id: string; text: string }[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "object" && item !== null && "id" in item && "text" in item)) {
      return parsed as { id: string; text: string }[];
    }
  } catch {}
  return [];
}

function parseAnswers(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

async function isOfficialTeam(teamId: string, phase: RoundRecord["phase"]) {
  if (phase === "prelim") return true;
  const limit = phase === "playoff" ? 5 : 2;
  const snapshot = await database().prepare(
    "SELECT entries_json AS entriesJson FROM leaderboard_snapshots WHERE rank_limit = ? ORDER BY published_at DESC LIMIT 1",
  ).bind(limit).first<{ entriesJson: string }>();
  if (!snapshot) return false;
  try {
    const entries = JSON.parse(snapshot.entriesJson) as { teamId: string }[];
    return entries.some((entry) => entry.teamId === teamId);
  } catch {
    return false;
  }
}

export async function submitForCaptain(viewer: Viewer, choices: string[]) {
  const team = await getTeamForCaptain(viewer.email);
  if (!team) throw new Error("Your email is not assigned as a Captain.");
  if (!Array.isArray(choices) || choices.length !== 3 || new Set(choices).size !== 3) throw new Error("Choose three different options in ranked order.");
  const db = database();
  const round = await db.prepare(
    "SELECT id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, multiplier, state, opened_at AS openedAt, closes_at AS closesAt FROM rounds WHERE state = 'open' ORDER BY round_order LIMIT 1",
  ).first<RoundRecord>();
  if (!round || !round.closesAt || Date.parse(round.closesAt) <= Date.now()) throw new Error("This round is closed.");
  const optionIds = parseOptions(round.optionsJson).map((option) => option.id);
  if (optionIds.length !== 8 || choices.some((choice) => !optionIds.includes(choice))) throw new Error("Your selection contains an invalid option.");
  const timestamp = now();
  const result = await db.prepare(
    "INSERT INTO submissions (id, team_id, round_id, choices_json, submitted_at, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rounds WHERE id = ? AND state = 'open' AND closes_at > ?) ON CONFLICT(team_id, round_id) DO UPDATE SET choices_json = excluded.choices_json, updated_at = excluded.updated_at",
  ).bind(id(), team.id, round.id, JSON.stringify(choices), timestamp, timestamp, round.id, timestamp).run();
  if (!result.meta.changes) throw new Error("This round is closed.");
  await audit(viewer.email, "submission.upsert", round.id, { teamId: team.id });
  return { roundId: round.id, submittedAt: timestamp, official: await isOfficialTeam(team.id, round.phase) };
}

export async function updateRound(viewer: Viewer, input: { id: string; title: string; scenario: string; options: { id: string; text: string }[]; answers: string[] }) {
  await requireMaster(viewer);
  const ids = input.options.map((option) => option.id);
  if (input.options.length !== 8 || new Set(ids).size !== 8 || input.answers.length !== 3 || new Set(input.answers).size !== 3 || input.answers.some((answer) => !ids.includes(answer))) {
    throw new Error("A round needs eight distinct options and three ranked Boardroom Choices.");
  }
  if (!input.title.trim() || !input.scenario.trim() || input.options.some((option) => !option.text.trim())) {
    throw new Error("Add a title, scenario and text for every option before saving.");
  }
  const result = await database().prepare(
    "UPDATE rounds SET title = ?, scenario = ?, options_json = ?, answers_json = ?, updated_at = ? WHERE id = ? AND state = 'draft'",
  ).bind(input.title.trim(), input.scenario.trim(), JSON.stringify(input.options), JSON.stringify(input.answers), now(), input.id).run();
  if (!result.meta.changes) throw new Error("Only draft rounds can be edited.");
  await audit(viewer.email, "round.update", input.id, { optionCount: input.options.length });
}

export async function controlRound(viewer: Viewer, input: { action: "open" | "close" | "score-publish"; roundId: string; rankLimit?: number }) {
  await requireMaster(viewer);
  const db = database();
  const round = await db.prepare(
    "SELECT id, round_order AS roundOrder, title, phase, duration_seconds AS durationSeconds, scenario, options_json AS optionsJson, answers_json AS answersJson, multiplier, state, opened_at AS openedAt, closes_at AS closesAt FROM rounds WHERE id = ?",
  ).bind(input.roundId).first<RoundRecord>();
  if (!round) throw new Error("Round not found.");
  if (input.action === "open") {
    if (round.state !== "draft") throw new Error("A round can only be opened once. Create a new round for a replay.");
    const answers = parseAnswers(round.answersJson);
    if (!round.scenario || parseOptions(round.optionsJson).length !== 8 || answers.length !== 3) throw new Error("Load the scenario, eight options and Boardroom Choices before opening this round.");
    const unfinished = await db.prepare(
      "SELECT id FROM rounds WHERE round_order < ? AND state <> 'revealed' LIMIT 1",
    ).bind(round.roundOrder).first<{ id: string }>();
    if (unfinished) throw new Error("Reveal every earlier round before opening the next one.");
    if (round.phase === "playoff") {
      const topFive = await db.prepare("SELECT id FROM leaderboard_snapshots WHERE rank_limit = 5 LIMIT 1").first();
      if (!topFive) throw new Error("Publish the Top 5 after Round 4 before opening Round 5.");
    }
    if (round.phase === "final") {
      const topTwo = await db.prepare("SELECT id FROM leaderboard_snapshots WHERE rank_limit = 2 LIMIT 1").first();
      if (!topTwo) throw new Error("Publish the Top 2 after Round 5 before opening the finale.");
    }
    const timestamp = now();
    const closesAt = new Date(Date.now() + round.durationSeconds * 1000).toISOString();
    await db.batch([
      db.prepare("UPDATE rounds SET state = 'closed', updated_at = ? WHERE state = 'open'").bind(timestamp),
      db.prepare("UPDATE rounds SET state = 'open', opened_at = ?, closes_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, closesAt, timestamp, round.id),
    ]);
    await audit(viewer.email, "round.open", round.id, { closesAt });
    return { closesAt };
  }
  if (input.action === "close") {
    await db.prepare("UPDATE rounds SET state = 'closed', closes_at = ?, updated_at = ? WHERE id = ? AND state = 'open'").bind(now(), now(), round.id).run();
    await audit(viewer.email, "round.close", round.id, {});
    return {};
  }
  return scoreAndPublish(viewer, round, input.rankLimit ?? (round.phase === "prelim" ? 10 : 2));
}

async function scoreAndPublish(viewer: Viewer, round: RoundRecord, rankLimit: number) {
  if (round.state !== "closed" && round.state !== "revealed") throw new Error("Close the round before scoring it.");
  if (![2, 5, 10].includes(rankLimit)) throw new Error("Leaderboard limit must be Top 10, Top 5 or Top 2.");
  const allowedLimits = round.id === "round-4" ? [10, 5] : round.phase === "prelim" ? [10] : [2];
  if (!allowedLimits.includes(rankLimit)) throw new Error("This leaderboard cutoff is not valid for this round.");
  const answers = parseAnswers(round.answersJson);
  if (answers.length !== 3) throw new Error("The Boardroom Choices are missing.");
  const db = database();
  const [allTeams, roundSubmissions] = await db.batch([
    db.prepare("SELECT id, name FROM teams WHERE is_active = 1 ORDER BY name"),
    db.prepare("SELECT team_id AS teamId, choices_json AS choicesJson FROM submissions WHERE round_id = ?").bind(round.id),
  ]);
  const permitted = new Set<string>();
  for (const team of allTeams.results as unknown as { id: string }[]) {
    if (await isOfficialTeam(team.id, round.phase)) permitted.add(team.id);
  }
  const pointsByTeam = new Map<string, number>();
  for (const row of roundSubmissions.results as unknown as { teamId: string; choicesJson: string }[]) {
    if (!permitted.has(row.teamId)) continue;
    let choices: string[] = [];
    try { choices = JSON.parse(row.choicesJson); } catch {}
    const base = choices.reduce((total, choice) => {
      const index = answers.indexOf(choice);
      return total + (index === 0 ? 40 : index === 1 ? 30 : index === 2 ? 20 : 0);
    }, 0);
    const bonus = choices[0] === answers[0] ? 10 : 0;
    pointsByTeam.set(row.teamId, (base + bonus) * round.multiplier);
  }
  const timestamp = now();
  const scoreWrites = [...pointsByTeam.entries()].map(([teamId, points]) =>
    db.prepare("INSERT INTO score_lines (id, team_id, round_id, phase, points, calculated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, round_id) DO UPDATE SET points = excluded.points, calculated_at = excluded.calculated_at")
      .bind(id(), teamId, round.id, round.phase, points, timestamp),
  );
  if (scoreWrites.length) await db.batch(scoreWrites);
  const totals = await db.prepare(
    "SELECT t.id AS teamId, t.name AS teamName, COALESCE(SUM(s.points), 0) AS score FROM teams t LEFT JOIN score_lines s ON s.team_id = t.id AND s.phase = ? WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY score DESC, t.name ASC",
  ).bind(round.phase).all<{ teamId: string; teamName: string; score: number }>();
  let previousScore: number | null = null;
  let rank = 0;
  const entries = totals.results.map((entry, index) => {
    if (entry.score !== previousScore) rank = index + 1;
    previousScore = entry.score;
    return { teamId: entry.teamId, name: entry.teamName, score: entry.score, rank };
  }).filter((entry) => entry.rank <= rankLimit);
  const label = rankLimit === 10 ? "Top 10" : rankLimit === 5 ? "Top 5" : "Top 2";
  await db.batch([
    db.prepare("INSERT INTO leaderboard_snapshots (id, label, rank_limit, entries_json, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id(), label, rankLimit, JSON.stringify(entries), timestamp, viewer.email),
    db.prepare("UPDATE rounds SET state = 'revealed', updated_at = ? WHERE id = ?").bind(timestamp, round.id),
  ]);
  await audit(viewer.email, "leaderboard.publish", round.id, { label, entries: entries.length });
  return { label, entries };
}

export async function getPublicLeaderboard() {
  const snapshot = await database().prepare(
    "SELECT label, rank_limit AS rankLimit, entries_json AS entriesJson, published_at AS publishedAt FROM leaderboard_snapshots ORDER BY published_at DESC LIMIT 1",
  ).first<{ label: string; rankLimit: number; entriesJson: string; publishedAt: string }>();
  if (!snapshot) return { label: "Leaderboard", entries: [] as { teamId: string; name: string; score: number; rank: number }[], publishedAt: null };
  try {
    return { label: snapshot.label, entries: JSON.parse(snapshot.entriesJson), publishedAt: snapshot.publishedAt };
  } catch {
    return { label: "Leaderboard", entries: [], publishedAt: null };
  }
}
