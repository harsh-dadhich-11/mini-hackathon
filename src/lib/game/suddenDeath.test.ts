import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePicks, rulingNote } from "./suddenDeath.ts";

const pick = (teamId: string, choice: string | null) => ({ teamId, name: `Team ${teamId}`, choice });

test("the only correct team takes the single place", () => {
  const result = resolvePicks("B", [pick("a", "C"), pick("b", "B"), pick("c", null)], 1);
  assert.deepEqual(result.winners, ["b"]);
  assert.deepEqual(result.stillTied, []);
  assert.deepEqual(result.ranked.map((entry) => [entry.teamId, entry.correct]), [["b", true], ["a", false], ["c", false]]);
});

test("two correct teams for one place stay level; the wrong team is out", () => {
  const result = resolvePicks("B", [pick("a", "B"), pick("b", "B"), pick("c", "A")], 1);
  assert.deepEqual(result.winners, []);
  assert.deepEqual(result.stillTied.sort(), ["a", "b"]);
  assert.equal(result.slotsLeft, 1);
});

test("nobody right leaves everyone level, including teams that didn't answer", () => {
  const result = resolvePicks("D", [pick("a", "A"), pick("b", null)], 1);
  assert.deepEqual(result.winners, []);
  assert.deepEqual(result.stillTied.sort(), ["a", "b"]);
});

test("two places, one right: it goes through and the rest replay for the last place", () => {
  const result = resolvePicks("A", [pick("a", "A"), pick("b", "C"), pick("c", "D")], 2);
  assert.deepEqual(result.winners, ["a"]);
  assert.deepEqual(result.stillTied.sort(), ["b", "c"]);
  assert.equal(result.slotsLeft, 1);
});

test("exactly as many right as places resolves it", () => {
  const result = resolvePicks("C", [pick("a", "C"), pick("b", "C"), pick("c", "B")], 2);
  assert.deepEqual(result.winners.sort(), ["a", "b"]);
  assert.deepEqual(result.stillTied, []);
});

test("the ruling note lists every pick", () => {
  const { ranked } = resolvePicks("B", [pick("a", "B"), pick("b", null)], 1);
  assert.equal(rulingNote("SD4", "B", "8,849 m", ranked), "Sudden death SD4 (answer B · 8,849 m): Team a B ✓ · Team b no answer ✗");
});
