// Sudden death: one multiple-choice question, and only the right answer counts. Pure, so the ruling can be unit
// tested with `npm test`.

export const SUDDEN_DEATH_LETTERS = ["A", "B", "C", "D"] as const;

export type Pick = { teamId: string; name: string; choice: string | null };
export type PickResult = Pick & { correct: boolean };
export type SuddenDeathResult = {
  ranked: PickResult[];
  /** Teams that take places outright. */
  winners: string[];
  /** Teams still level for the remaining places. Run another question for just these. */
  stillTied: string[];
  /** Places left for the still-tied teams. */
  slotsLeft: number;
};

/**
 * Correct pickers go through when they fit the places available. More correct pickers than places: they stay level
 * (everyone wrong is out). Fewer: they go through and the wrong or silent teams stay level for what's left.
 * Nobody right: everyone stays level.
 */
export function resolvePicks(correct: string, picks: Pick[], slots: number): SuddenDeathResult {
  const ranked = picks
    .map((pick) => ({ ...pick, correct: pick.choice !== null && pick.choice === correct }))
    .sort((a, b) => Number(b.correct) - Number(a.correct) || a.name.localeCompare(b.name));
  const right = ranked.filter((entry) => entry.correct).map((entry) => entry.teamId);
  const rest = ranked.filter((entry) => !entry.correct).map((entry) => entry.teamId);
  if (slots >= ranked.length) return { ranked, winners: ranked.map((entry) => entry.teamId), stillTied: [], slotsLeft: 0 };
  if (right.length === slots) return { ranked, winners: right, stillTied: [], slotsLeft: 0 };
  if (right.length > slots) return { ranked, winners: [], stillTied: right, slotsLeft: slots };
  return { ranked, winners: right, stillTied: rest, slotsLeft: slots - right.length };
}

/** The ruling note recorded on the qualification, e.g. "Sudden death SD4 (answer B · 8,849 m): Alpha B ✓ · Bravo D ✗". */
export function rulingNote(questionKey: string, correct: string, correctText: string, ranked: PickResult[]) {
  const picks = ranked.map((entry) => `${entry.name} ${entry.choice ?? "no answer"} ${entry.correct ? "✓" : "✗"}`);
  return `Sudden death ${questionKey} (answer ${correct}${correctText ? ` · ${correctText}` : ""}): ${picks.join(" · ")}`;
}
