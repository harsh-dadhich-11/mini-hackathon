// What Captains and the projector are allowed to see, built field by field from stored rows.
// Pure (no storage, no "server-only"), so `npm test` can prove answer keys and other teams' data never leak.
// Every view picks fields explicitly; never spread a stored row into a response.

import type { Option, Phase, PublicTeam, RoundRecord, RoundState, Stage, SuddenDeathRecord } from "@/types";
import type { PickResult } from "./suddenDeath";

export function parseJson<T>(value: string | null | undefined, valid: (parsed: unknown) => boolean, fallback: T): T {
  try {
    const parsed = JSON.parse(value ?? "") as unknown;
    return valid(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

export const parseOptions = (value: string) =>
  parseJson<Option[]>(value, (parsed) => Array.isArray(parsed) && parsed.every((item) => typeof item === "object" && item !== null && "id" in item && "text" in item), [])
    .map((option) => ({ id: String(option.id), text: String(option.text) }));

export const parseStrings = (value: string) =>
  parseJson<string[]>(value, (parsed) => Array.isArray(parsed) && parsed.every((item) => typeof item === "string"), []);

export type RevealedChoice = { rank: number; optionId: string; text: string; evidence: string };

/** The last reveal step: after #1 comes the principle and why the other options rank lower. */
export const LAST_REVEAL_STEP = 4;

/** The Boardroom Choices visible at a reveal step. Step 1 shows #3, step 2 adds #2, step 3 adds #1. Nothing at step 0. */
export function revealedChoices(round: RoundRecord, step: number): RevealedChoice[] {
  const visible = Math.max(0, Math.min(3, Math.floor(step)));
  const options = parseOptions(round.optionsJson);
  const answers = parseStrings(round.answersJson);
  const evidence = parseStrings(round.evidenceJson);
  return [2, 1, 0].slice(0, visible).map((index) => ({
    rank: index + 1,
    optionId: answers[index] ?? "",
    text: options.find((option) => option.id === answers[index])?.text ?? "",
    evidence: evidence[index] ?? "",
  }));
}

export type TeamRoundView = {
  id: string;
  title: string;
  phase: Phase;
  multiplier: number;
  scenario: string;
  context: string;
  leadHat: string;
  options: Option[];
  state: RoundState;
  durationSeconds: number;
  closesAt: string | null;
  pausedRemainingMs: number | null;
};

/** The current question for a Captain: scenario and options only. No Boardroom Choices, evidence or principle. */
export function toTeamRound(round: RoundRecord): TeamRoundView {
  return {
    id: round.id,
    title: round.title,
    phase: round.phase,
    multiplier: round.multiplier,
    scenario: round.scenario,
    context: round.context,
    leadHat: round.leadHat,
    options: parseOptions(round.optionsJson),
    state: round.state,
    durationSeconds: round.durationSeconds,
    closesAt: round.closesAt,
    pausedRemainingMs: round.pausedRemainingMs,
  };
}

export type TeamReveal = {
  roundId: string;
  title: string;
  step: number;
  revealed: { rank: number; optionId: string; text: string }[];
  myChoices: string[] | null;
  points: number | null;
  /** The practice round: points are shown as "would have scored" and never count. */
  practice: boolean;
};

/**
 * The projector's current reveal from one team's point of view: only the choices already on the public
 * screen (without evidence), that team's own picks, and its own points once #1 is out.
 */
export function toTeamReveal(round: RoundRecord, step: number, own: { choicesJson: string | null; points: number | null }): TeamReveal {
  return {
    roundId: round.id,
    title: round.title,
    step,
    revealed: revealedChoices(round, step).map(({ rank, optionId, text }) => ({ rank, optionId, text })),
    myChoices: own.choicesJson === null ? null : parseStrings(own.choicesJson),
    points: step >= 3 ? Number(own.points ?? 0) : null,
    practice: round.phase === "trial",
  };
}

/** Leaderboard rows: name, score and rank only. */
export function toPublicEntries(entries: readonly PublicTeam[]): PublicTeam[] {
  return entries.map(({ teamId, name, score, rank }) => ({ teamId, name, score, rank }));
}

/** The question as the projector shows it while answers are open. The principle stays hidden: it gives the answer away. */
export function toPublicQuestion(round: RoundRecord) {
  return {
    title: round.title,
    phase: round.phase,
    multiplier: round.multiplier,
    scenario: round.scenario,
    context: round.context,
    leadHat: round.leadHat,
    options: parseOptions(round.optionsJson),
    state: round.state,
    durationSeconds: round.durationSeconds,
    closesAt: round.closesAt,
    pausedRemainingMs: round.pausedRemainingMs,
  };
}

/** The projector's reveal: the question plus the Boardroom Choices (with evidence) released so far, then the principle. */
export function toPublicReveal(round: RoundRecord, step: number) {
  const done = step >= LAST_REVEAL_STEP;
  return {
    title: round.title,
    phase: round.phase,
    multiplier: round.multiplier,
    scenario: round.scenario,
    context: round.context,
    options: parseOptions(round.optionsJson),
    step,
    revealed: revealedChoices(round, step),
    principle: done ? round.principle : null,
    othersNote: done ? round.othersNote : null,
  };
}

// ---------------------------------------------------------------- Sudden death

export type SuddenDeathTeam = { teamId: string; name: string };

/**
 * The projector's sudden death. Step 0: the question, its four options, the tied teams and who has locked in (never
 * which letter). Step 1 adds the correct letter. Step 2 adds every team's pick and who goes through.
 */
export function toPublicSuddenDeath(record: SuddenDeathRecord, step: number, teams: SuddenDeathTeam[], answeredIds: Set<string>, ranked: PickResult[], winners: string[]) {
  return {
    id: record.id,
    stage: record.stage as Stage,
    questionKey: record.questionKey,
    question: record.question,
    options: parseOptions(record.optionsJson),
    state: record.state,
    slots: record.slots,
    closesAt: record.closesAt,
    step,
    teams: teams.map(({ teamId, name }) => ({ teamId, name, answered: answeredIds.has(teamId) })),
    correct: step >= 1 ? record.correctOption : null,
    picks: step >= 2 ? ranked.map(({ teamId, name, choice, correct }) => ({ teamId, name, choice, correct, winner: winners.includes(teamId) })) : null,
  };
}

/** One Captain's view of a sudden death: the question and options, whether they are playing, their own pick, and the answer once it is on screen. */
export function toTeamSuddenDeath(record: SuddenDeathRecord, step: number | null, playing: boolean, own: string | null, won: boolean | null) {
  return {
    id: record.id,
    questionKey: record.questionKey,
    question: record.question,
    options: parseOptions(record.optionsJson),
    state: record.state,
    closesAt: record.closesAt,
    playing,
    myChoice: playing ? own : null,
    correct: step !== null && step >= 1 ? record.correctOption : null,
    won: step !== null && step >= 2 && playing ? won : null,
  };
}
