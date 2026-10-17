// Pure scoring rules. No storage access, so they can be unit tested with `npm test`.

export const POINTS_BY_BOARDROOM_RANK = [40, 30, 20] as const;
export const FIRST_PICK_BONUS = 10;

export type Total = { teamId: string; name: string; score: number };
export type Ranked = Total & { rank: number };

/** Fixed scoring: 40/30/20 for Boardroom Choices, plus 10 only for #1 ranked first. */
export function scoreSubmission(choices: string[], answers: string[]) {
  const base = choices.reduce((total, choice) => {
    const index = answers.indexOf(choice);
    return total + (index >= 0 ? POINTS_BY_BOARDROOM_RANK[index] ?? 0 : 0);
  }, 0);
  const bonus = choices[0] !== undefined && choices[0] === answers[0] ? FIRST_PICK_BONUS : 0;
  return base + bonus;
}

/** Highest score first; equal scores share a rank (1, 1, 3). Name order only keeps the list stable. */
export function rankTeams(totals: Total[]): Ranked[] {
  const sorted = [...totals].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.score !== sorted[index - 1].score) rank = index + 1;
    return { ...entry, rank };
  });
}

/**
 * When teams tied on score straddle the cutoff of `places`, the Game Jury must choose.
 * Returns the teams that are safely through, the tied group, and how many of the tied group can go through.
 */
export function cutoffTie(ranked: Ranked[], places: number) {
  if (ranked.length <= places) return null;
  const boundary = ranked[places - 1].score;
  if (ranked[places].score !== boundary) return null;
  const through = ranked.filter((entry) => entry.score > boundary);
  const tied = ranked.filter((entry) => entry.score === boundary);
  return { through, tied, slots: places - through.length };
}
