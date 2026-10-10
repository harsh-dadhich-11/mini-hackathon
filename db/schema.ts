import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const eventSettings = sqliteTable("event_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const masters = sqliteTable("masters", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  addedAt: text("added_at").notNull(),
});

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tableNumber: text("table_number").notNull(),
    captainName: text("captain_name").notNull(),
    captainEmail: text("captain_email").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSignInAt: text("last_sign_in_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("teams_captain_email_unique").on(table.captainEmail),
    uniqueIndex("teams_name_unique").on(table.name),
  ],
);

export const rounds = sqliteTable(
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
);

export const submissions = sqliteTable(
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
);

export const scoreLines = sqliteTable(
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
);

export const leaderboardSnapshots = sqliteTable(
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
);

export const auditLog = sqliteTable(
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
);

export const captainCodes = sqliteTable(
  "captain_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    linkHash: text("link_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("captain_codes_email_idx").on(table.email, table.createdAt),
    uniqueIndex("captain_codes_link_unique").on(table.linkHash),
  ],
);

export const captainSessions = sqliteTable(
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
);

export const masterSessions = sqliteTable(
  "master_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("master_sessions_email_idx").on(table.email)],
);

export const qualifications = sqliteTable(
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
);
