import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLetters, parsePoints } from "./format.ts";

test("paper and paddle letters accept commas, spaces or nothing between them", () => {
  assert.deepEqual(parseLetters("A,C,F"), ["A", "C", "F"]);
  assert.deepEqual(parseLetters("a c f"), ["A", "C", "F"]);
  assert.deepEqual(parseLetters("acf"), ["A", "C", "F"]);
  assert.deepEqual(parseLetters(" A, C ,F "), ["A", "C", "F"]);
});

test("anything but three different letters is refused", () => {
  assert.equal(parseLetters("A,A,C"), null);
  assert.equal(parseLetters("A,C"), null);
  assert.equal(parseLetters("AB,C,D"), null);
  assert.equal(parseLetters("ACFD"), null);
});

test("a score correction typo is refused instead of clearing the override", () => {
  assert.equal(parsePoints("40"), 40);
  assert.equal(parsePoints(" 0 "), 0);
  assert.equal(parsePoints(""), null);
  assert.equal(parsePoints("4O"), "invalid");
  assert.equal(parsePoints("40pts"), "invalid");
  assert.equal(parsePoints("101"), "invalid");
  assert.equal(parsePoints("-5"), "invalid");
  assert.equal(parsePoints("12.5"), "invalid");
});
