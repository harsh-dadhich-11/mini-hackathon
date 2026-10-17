// Shared game types. Type-only, so client components can import them without pulling in server code.

export type Viewer = { email: string; displayName: string };

export type TeamRecord = {
  id: string;
  name: string;
  tableNumber: string;
  captainName: string;
  captainEmail: string;
  isActive: number;
};

/** "trial": the practice round, never counts. "prelim": Rounds 1–4, every team. "final": Rounds 5–6 on stage, scores reset. */
export type Phase = "trial" | "prelim" | "final";
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
  /** The setup line under the scenario, e.g. "You are the leadership team of…". */
  context: string;
  leadHat: string;
  /** Revealed only after the Boardroom #1: it gives the answer away. */
  principle: string;
  /** "Why the other options rank lower", revealed with the principle. */
  othersNote: string;
  /** The emcee's stage follow-up question. Master console only. */
  followUp: string;
  multiplier: number;
  state: RoundState;
  openedAt: string | null;
  closesAt: string | null;
  pausedRemainingMs: number | null;
};

export type Option = { id: string; text: string };
export type Stage = "top2" | "final" | "audience";
/** Stages that a sudden-death number question can decide. */
export type TieStage = Stage;

export type Display =
  | { mode: "idle" }
  /** `snapshotId` pins what is on screen, so a later stage confirmation can't replace it before its reveal. */
  | { mode: "standings"; snapshotId?: string }
  | { mode: "question"; roundId: string }
  | { mode: "reveal"; roundId: string; step: number }
  | { mode: "qualifiers"; stage: "top2"; step: number }
  | { mode: "awards"; step: number }
  /** Step 0: question and timer. 1: the correct answer. 2: every guess and who was closest. */
  | { mode: "sudden-death"; id: string; step: number };

/** Master switches for the projector's soundtrack. */
export type AudioSettings = { music: boolean; sfx: boolean };

export type SuddenDeathState = "open" | "closed";

export type SuddenDeathRecord = {
  id: string;
  stage: Stage;
  questionKey: string;
  question: string;
  /** Four options, A–D. */
  optionsJson: string;
  /** The one letter that counts. Never sent to Captains or the projector before the answer step. */
  correctOption: string;
  teamIdsJson: string;
  slots: number;
  carriedJson: string;
  state: SuddenDeathState;
  durationSeconds: number;
  openedAt: string;
  closesAt: string;
  createdAt: string;
};

export type RoundControl = "open" | "pause" | "resume" | "extend" | "close";

/** A team as the projector and Captains may see it: never emails, submissions or ids beyond the team's own. */
export type PublicTeam = { teamId: string; name: string; score: number; rank: number };
