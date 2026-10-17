import assert from "node:assert/strict";
import { test } from "node:test";
import { debateSegment } from "./segments.ts";

const at = (minutes: number, seconds = 0) => (minutes * 60 + seconds) * 1000;

test("the 6:00 timer walks through the deck's debate segments", () => {
  assert.equal(debateSegment(at(6)).key, "silent");
  assert.equal(debateSegment(at(5, 1)).key, "silent");
  assert.equal(debateSegment(at(5)).key, "hats");
  assert.equal(debateSegment(at(3, 1)).key, "hats");
  assert.equal(debateSegment(at(3)).key, "debate");
  assert.equal(debateSegment(at(1, 31)).key, "debate");
  assert.equal(debateSegment(at(1, 30)).key, "close");
  assert.equal(debateSegment(at(1)).key, "lock");
  assert.equal(debateSegment(1).key, "lock");
  assert.equal(debateSegment(0).key, "lock");
  assert.equal(debateSegment(-5000).key, "lock");
});

test("an extension beyond 6:00 stays in the silent pick", () => {
  assert.equal(debateSegment(at(7)).key, "silent");
});
