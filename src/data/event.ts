import "server-only";
import type { Phase, Stage } from "@/types";

// Server-side game configuration. Do not import from client components: it holds the Master emails.
// Public display strings live in ./brand.ts.

/** The two Master accounts. Only these emails can sign in to /master. A Master email can never be a Captain. */
export const MASTER_EMAILS = ["swasti@botconsulting.io", "harsh.dadhich@botconsulting.io"];

export const MAX_TEAMS = 30;

/**
 * The fixed schedule: [id, order, title, phase, seconds, multiplier]. A two-minute practice round that never counts,
 * then Rounds 1–4 (qualifiers for every team); the Top 2 on that total play Rounds 5–6 on stage, where scores reset.
 */
export const SCHEDULE = [
  ["trial", 0, "Practice round · The Coffee Crisis", "trial", 120, 1],
  ["round-1", 1, "Round 1 · Security Incident", "prelim", 360, 1],
  ["round-2", 2, "Round 2 · AI Disruption", "prelim", 360, 1],
  ["round-3", 3, "Round 3 · Talent Bomb", "prelim", 360, 1],
  ["round-4", 4, "Round 4 · Business Pressure", "prelim", 360, 1],
  ["round-5", 5, "Round 5 · Client Escalation", "final", 360, 1],
  ["round-6", 6, "Round 6 · The Acquisition", "final", 360, 1],
] as const satisfies readonly (readonly [string, number, string, Phase, number, number])[];

/** Places available at each stage. Every answer is retained; qualification is calculated separately. */
export const STAGES: Record<Stage, { places: number; track: Phase | "audience"; label: string }> = {
  top2: { places: 2, track: "prelim", label: "Top 2 · Finalists" },
  final: { places: 1, track: "final", label: "Final result" },
  audience: { places: 1, track: "audience", label: "Chocolate hamper · Audience winner" },
};

/** How many teams each round's published leaderboard shows. The practice round never publishes one. */
export const PUBLISH_LIMIT: Record<Phase, number> = { trial: 0, prelim: 10, final: 2 };

/** The six scored rounds, before the practice round existed: an event on exactly this schedule gains the practice round without losing anything. */
export const SCORED_ROUND_IDS: string[] = SCHEDULE.filter((round) => round[3] !== "trial").map((round) => round[0]);

/** Answers already on their way when the clock hits 00:00 are still accepted for this long. */
export const SUBMIT_GRACE_MS = 1500;

/** Sudden-death answer window. */
export const SUDDEN_DEATH_SECONDS = 60;
