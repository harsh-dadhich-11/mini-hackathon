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
