import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

// Supabase Postgres. Timestamps stay ISO-8601 text so the event store compares them exactly as before.
// Every table enables row-level security with no policies: Supabase's public REST API cannot read or
// write them, and only the server's direct DATABASE_URL connection (table owner) can.

export const eventSettings = pgTable("event_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
}).enableRLS();

export const masters = pgTable("masters", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  addedAt: text("added_at").notNull(),
}).enableRLS();

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tableNumber: text("table_number").notNull(),
    captainName: text("captain_name").notNull(),
    captainEmail: text("captain_email").notNull(),
    isActive: integer("is_active").notNull().default(1),
    lastSignInAt: text("last_sign_in_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("teams_captain_email_unique").on(table.captainEmail),
    uniqueIndex("teams_name_unique").on(table.name),
  ],
).enableRLS();

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    roundOrder: integer("round_order").notNull(),
    title: text("title").notNull(),
    phase: text("phase").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    scenario: text("scenario").notNull().default(""),
    optionsJson: text("options_json").notNull().default("[]"),
    answersJson: text("answers_json").notNull().default("[]"),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    context: text("context").notNull().default(""),
    leadHat: text("lead_hat").notNull().default(""),
    principle: text("principle").notNull().default(""),
    othersNote: text("others_note").notNull().default(""),
    followUp: text("follow_up").notNull().default(""),
    multiplier: integer("multiplier").notNull().default(1),
    state: text("state").notNull().default("draft"),
    openedAt: text("opened_at"),
    closesAt: text("closes_at"),
    pausedRemainingMs: integer("paused_remaining_ms"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("rounds_order_unique").on(table.roundOrder),
    index("rounds_state_order_idx").on(table.state, table.roundOrder),
  ],
).enableRLS();

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id),
    roundId: text("round_id").notNull().references(() => rounds.id),
    choicesJson: text("choices_json").notNull(),
    submittedAt: text("submitted_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("submissions_team_round_unique").on(table.teamId, table.roundId),
    index("submissions_round_idx").on(table.roundId),
  ],
).enableRLS();

export const scoreLines = pgTable(
  "score_lines",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id),
    roundId: text("round_id").notNull().references(() => rounds.id),
    phase: text("phase").notNull(),
    points: integer("points").notNull(),
    overridePoints: integer("override_points"),
    overrideReason: text("override_reason"),
    overriddenBy: text("overridden_by"),
    calculatedAt: text("calculated_at").notNull(),
  },
  (table) => [
    uniqueIndex("score_lines_team_round_unique").on(table.teamId, table.roundId),
    index("score_lines_phase_team_idx").on(table.phase, table.teamId),
  ],
).enableRLS();

export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: text("id").primaryKey(),
    /** "round" and "audience" boards are put on screen; "stage" records a confirmed qualification and never is. */
    kind: text("kind").notNull().default("round"),
    label: text("label").notNull(),
    rankLimit: integer("rank_limit").notNull(),
    entriesJson: text("entries_json").notNull(),
    publishedAt: text("published_at").notNull(),
    publishedBy: text("published_by").notNull(),
  },
  (table) => [index("leaderboard_snapshots_published_idx").on(table.publishedAt)],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    detailJson: text("detail_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("audit_log_created_idx").on(table.createdAt)],
).enableRLS();

/** Six-digit email sign-in codes for Captains and Masters, sent through Resend. Only hashes are stored. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    /** The browser that asked for this code (an HttpOnly cookie); null for a code a Master sent. */
    challengeId: text("challenge_id"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("login_codes_email_idx").on(table.email, table.createdAt)],
).enableRLS();

export const captainSessions = pgTable(
  "captain_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("captain_sessions_team_idx").on(table.teamId)],
).enableRLS();

export const masterSessions = pgTable(
  "master_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("master_sessions_email_idx").on(table.email)],
).enableRLS();

export const qualifications = pgTable(
  "qualifications",
  {
    stage: text("stage").notNull(),
    teamId: text("team_id").notNull().references(() => teams.id),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    rulingNote: text("ruling_note"),
    decidedBy: text("decided_by").notNull(),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.stage, table.teamId] })],
).enableRLS();

/** Fixed-window counters for sign-in brute-force limits, shared by every server instance. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: text("window_start").notNull(),
  count: integer("count").notNull(),
}).enableRLS();

/** View-only projector links. Only the SHA-256 of each key is stored. */
export const displayTokens = pgTable(
  "display_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("display_tokens_hash_unique").on(table.tokenHash)],
).enableRLS();

/** A multiple-choice tiebreak (only the right answer counts), played on the Captains' devices by the tied teams only. */
export const suddenDeaths = pgTable(
  "sudden_deaths",
  {
    id: text("id").primaryKey(),
    stage: text("stage").notNull(),
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    optionsJson: text("options_json").notNull().default("[]"),
    correctOption: text("correct_option").notNull().default(""),
    teamIdsJson: text("team_ids_json").notNull(),
    slots: integer("slots").notNull(),
    /** Teams already through from an earlier sudden death in the same tie, when this one replays a level cutoff. */
    carriedJson: text("carried_json").notNull().default("[]"),
    state: text("state").notNull().default("open"),
    durationSeconds: integer("duration_seconds").notNull(),
    openedAt: text("opened_at").notNull(),
    closesAt: text("closes_at").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sudden_deaths_created_idx").on(table.createdAt),
    // At most one sudden death can be open at a time, even if two Masters click Start together.
    uniqueIndex("sudden_deaths_one_open").on(table.state).where(sql`state = 'open'`),
  ],
).enableRLS();

export const suddenDeathAnswers = pgTable(
  "sudden_death_answers",
  {
    suddenDeathId: text("sudden_death_id").notNull().references(() => suddenDeaths.id),
    teamId: text("team_id").notNull().references(() => teams.id),
    choice: text("choice").notNull(),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.suddenDeathId, table.teamId] })],
).enableRLS();
