import assert from "node:assert/strict";
import { test } from "node:test";
import { cutoffTie, rankTeams, scoreSubmission } from "./scoring.ts";

const answers = ["C", "F", "A"];

test("perfect ranked answer scores the 100-point maximum", () => {
  assert.equal(scoreSubmission(["C", "F", "A"], answers), 100);
});

test("Boardroom Choices score wherever the team ranked them, bonus only for #1 first", () => {
  assert.equal(scoreSubmission(["A", "F", "C"], answers), 90);
  assert.equal(scoreSubmission(["F", "C", "B"], answers), 70);
  assert.equal(scoreSubmission(["B", "D", "E"], answers), 0);
});

test("v4 scoring is fixed and caps a perfect ordered answer at 100", () => {
  assert.equal(scoreSubmission(["C", "F", "A"], answers), 100);
  assert.equal(scoreSubmission(["F", "B", "D"], answers), 30);
});

test("equal totals share a rank", () => {
  const ranked = rankTeams([
    { teamId: "a", name: "Alpha", score: 90 },
    { teamId: "b", name: "Bravo", score: 120 },
    { teamId: "c", name: "Charlie", score: 90 },
    { teamId: "d", name: "Delta", score: 40 },
  ]);
  assert.deepEqual(ranked.map((entry) => [entry.teamId, entry.rank]), [["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
});

test("detects a tie across the Top 5 cutoff", () => {
  const ranked = rankTeams([100, 90, 80, 70, 60, 60, 50].map((score, index) => ({ teamId: `t${index}`, name: `Team ${index}`, score })));
  const tie = cutoffTie(ranked, 5);
  assert.ok(tie);
  assert.deepEqual(tie.through.map((entry) => entry.teamId), ["t0", "t1", "t2", "t3"]);
  assert.deepEqual(tie.tied.map((entry) => entry.teamId), ["t4", "t5"]);
  assert.equal(tie.slots, 1);
});

test("a tie entirely inside the cutoff needs no ruling", () => {
  const ranked = rankTeams([100, 90, 90, 70, 60, 50].map((score, index) => ({ teamId: `t${index}`, name: `Team ${index}`, score })));
  assert.equal(cutoffTie(ranked, 5), null);
});

test("detects a tie at the Top 2 cutoff and for the winner", () => {
  const ranked = rankTeams([80, 50, 50].map((score, index) => ({ teamId: `t${index}`, name: `Team ${index}`, score })));
  assert.equal(cutoffTie(ranked, 2)?.slots, 1);
  const finale = rankTeams([{ teamId: "x", name: "X", score: 200 }, { teamId: "y", name: "Y", score: 200 }]);
  assert.equal(cutoffTie(finale, 1)?.tied.length, 2);
});
