import assert from "node:assert/strict";
import { test } from "node:test";
import type { RoundRecord } from "../../types/index.ts";
import { revealedChoices, toPublicEntries, toPublicQuestion, toPublicReveal, toPublicSuddenDeath, toTeamReveal, toTeamRound, toTeamSuddenDeath } from "./publicViews.ts";
import { resolvePicks } from "./suddenDeath.ts";
import type { SuddenDeathRecord } from "../../types/index.ts";

const SECRET_EVIDENCE = ["EVIDENCE-ONE", "EVIDENCE-TWO", "EVIDENCE-THREE"];

const round: RoundRecord = {
  id: "round-3",
  roundOrder: 3,
  title: "Round 3 · Client Escalation",
  phase: "prelim",
  durationSeconds: 360,
  scenario: "The client escalates.",
  optionsJson: JSON.stringify(["A", "B", "C", "D", "E", "F"].map((id) => ({ id, text: `Option text ${id}` }))),
  answersJson: JSON.stringify(["C", "F", "A"]),
  evidenceJson: JSON.stringify(SECRET_EVIDENCE),
  context: "You are the leadership team.",
  leadHat: "Business and Clients",
  principle: "SECRET-PRINCIPLE",
  othersNote: "SECRET-OTHERS",
  followUp: "SECRET-FOLLOW-UP",
  multiplier: 1,
  state: "open",
  openedAt: null,
  closesAt: "2026-10-15T10:06:00.000Z",
  pausedRemainingMs: null,
};

const json = (value: unknown) => JSON.stringify(value);

test("a Captain's round view never carries the answer key or evidence", () => {
  const view = toTeamRound(round);
  const body = json(view);
  for (const field of ["answersJson", "evidenceJson", "answers", "evidence"]) assert.ok(!(field in view), `${field} must not be present`);
  for (const secret of [...SECRET_EVIDENCE, "SECRET-PRINCIPLE", "SECRET-OTHERS", "SECRET-FOLLOW-UP"]) assert.ok(!body.includes(secret));
  assert.ok(!body.includes('"C","F","A"'));
  assert.equal(view.leadHat, "Business and Clients");
  assert.deepEqual(view.options.map((option) => option.id), ["A", "B", "C", "D", "E", "F"]);
});

test("the projector question view has no answer key", () => {
  const body = json(toPublicQuestion(round));
  assert.ok(!body.includes("answers"));
  for (const secret of [...SECRET_EVIDENCE, "SECRET-PRINCIPLE", "SECRET-OTHERS", "SECRET-FOLLOW-UP"]) assert.ok(!body.includes(secret));
});

test("the principle and why-the-others note appear only at the last reveal step, the follow-up never", () => {
  for (const step of [0, 1, 2, 3]) {
    const body = json(toPublicReveal(round, step));
    assert.ok(!body.includes("SECRET-PRINCIPLE") && !body.includes("SECRET-OTHERS"), `step ${step}`);
  }
  const last = toPublicReveal(round, 4);
  assert.equal(last.principle, "SECRET-PRINCIPLE");
  assert.equal(last.othersNote, "SECRET-OTHERS");
  assert.ok(!json(last).includes("SECRET-FOLLOW-UP"));
  assert.ok(!json(toTeamReveal(round, 4, { choicesJson: null, points: 0 })).includes("SECRET-PRINCIPLE"));
});

const suddenDeath: SuddenDeathRecord = {
  id: "sd-1",
  stage: "top2",
  questionKey: "SD4",
  question: "How tall is Mount Everest, in metres?",
  optionsJson: JSON.stringify([{ id: "A", text: "8,611 m" }, { id: "B", text: "8,849 m" }, { id: "C", text: "8,950 m" }, { id: "D", text: "9,120 m" }]),
  correctOption: "B",
  teamIdsJson: JSON.stringify(["a", "b"]),
  slots: 1,
  carriedJson: "[]",
  state: "open",
  durationSeconds: 60,
  openedAt: "2026-10-15T10:00:00.000Z",
  closesAt: "2026-10-15T10:01:00.000Z",
  createdAt: "2026-10-15T10:00:00.000Z",
};

test("sudden death keeps the correct letter and the picks off screen until their step", () => {
  const teams = [{ teamId: "a", name: "Alpha" }, { teamId: "b", name: "Bravo" }];
  const { ranked, winners } = resolvePicks("B", [{ teamId: "a", name: "Alpha", choice: "D" }, { teamId: "b", name: "Bravo", choice: null }], 1);
  const stepZero = toPublicSuddenDeath(suddenDeath, 0, teams, new Set(["a"]), ranked, winners);
  assert.equal(stepZero.correct, null);
  assert.equal(stepZero.picks, null);
  assert.equal(stepZero.options.length, 4);
  assert.ok(!json(stepZero).includes("correctOption") && !json(stepZero).includes('"choice"'));
  assert.deepEqual(stepZero.teams.map((team) => team.answered), [true, false]);
  const stepOne = toPublicSuddenDeath(suddenDeath, 1, teams, new Set(["a"]), ranked, winners);
  assert.equal(stepOne.correct, "B");
  assert.equal(stepOne.picks, null);
  const stepTwo = toPublicSuddenDeath(suddenDeath, 2, teams, new Set(["a"]), ranked, winners);
  assert.deepEqual(stepTwo.picks?.map((entry) => [entry.name, entry.choice, entry.correct]), [["Alpha", "D", false], ["Bravo", null, false]]);
});

test("a Captain sees only their own pick, and the correct letter once it is on screen", () => {
  const hidden = toTeamSuddenDeath(suddenDeath, null, true, "D", null);
  assert.equal(hidden.correct, null);
  assert.equal(hidden.myChoice, "D");
  assert.ok(!json(hidden).includes("correctOption"));
  assert.equal(toTeamSuddenDeath(suddenDeath, 0, true, "D", null).correct, null);
  assert.equal(toTeamSuddenDeath(suddenDeath, 1, true, "D", null).correct, "B");
  assert.equal(toTeamSuddenDeath(suddenDeath, 2, false, "D", null).myChoice, null);
});

test("reveal steps release #3, then #2, then #1, never more", () => {
  assert.deepEqual(revealedChoices(round, 0), []);
  assert.deepEqual(revealedChoices(round, 1).map((choice) => [choice.rank, choice.optionId]), [[3, "A"]]);
  assert.deepEqual(revealedChoices(round, 2).map((choice) => choice.rank), [3, 2]);
  assert.deepEqual(revealedChoices(round, 3).map((choice) => choice.rank), [3, 2, 1]);
  assert.equal(revealedChoices(round, 99).length, 3);
  assert.equal(revealedChoices(round, -4).length, 0);
  // Step 1 must not mention #1 or #2 anywhere, including evidence.
  const stepOne = json(toPublicReveal(round, 1));
  assert.ok(stepOne.includes("EVIDENCE-THREE"));
  assert.ok(!stepOne.includes("EVIDENCE-ONE") && !stepOne.includes("EVIDENCE-TWO"));
});

test("a Captain's reveal mirrors the screen without evidence, and hides points until #1", () => {
  const early = toTeamReveal(round, 2, { choicesJson: JSON.stringify(["C", "B", "A"]), points: 70 });
  assert.equal(early.points, null);
  assert.deepEqual(early.revealed.map((choice) => choice.optionId), ["A", "F"]);
  for (const secret of SECRET_EVIDENCE) assert.ok(!json(early).includes(secret));
  const done = toTeamReveal(round, 3, { choicesJson: JSON.stringify(["C", "B", "A"]), points: 70 });
  assert.equal(done.points, 70);
  assert.deepEqual(done.myChoices, ["C", "B", "A"]);
  assert.equal(toTeamReveal(round, 3, { choicesJson: null, points: null }).myChoices, null);
});

test("leaderboard entries drop everything but name, score and rank", () => {
  const leaky = [{ teamId: "t1", name: "Alpha", score: 90, rank: 1, captainEmail: "captain@example.com", choicesJson: '["A"]' }];
  const [entry] = toPublicEntries(leaky);
  assert.deepEqual(Object.keys(entry).sort(), ["name", "rank", "score", "teamId"]);
  assert.ok(!json(entry).includes("@"));
});
