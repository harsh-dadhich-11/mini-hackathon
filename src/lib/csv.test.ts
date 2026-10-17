import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRoster } from "./csv.ts";

test("quoted names keep their commas", () => {
  const [row] = parseRoster('"Smith, Jones & Co",4,Asha Rao,asha@example.com');
  assert.deepEqual(row, { line: 1, name: "Smith, Jones & Co", tableNumber: "4", captainName: "Asha Rao", captainEmail: "asha@example.com" });
});

test("a header row is skipped only when it matches the column names", () => {
  assert.equal(parseRoster("name, table, captain name, captain email\nAlpha,1,Ann,ann@x.com").length, 1);
  // A first team whose email contains "email" is a team, not a header.
  const rows = parseRoster("Alpha,1,Ann,ann@email.com\nBravo,2,Ben,ben@x.com");
  assert.deepEqual(rows.map((row) => row.name), ["Alpha", "Bravo"]);
});

test("tab-separated text pasted from a spreadsheet works", () => {
  const rows = parseRoster("Team name\tTable\tCaptain name\tCaptain email\nAlpha, Inc\t1\tAnn Lee\tann@x.com\n");
  assert.deepEqual(rows, [{ line: 2, name: "Alpha, Inc", tableNumber: "1", captainName: "Ann Lee", captainEmail: "ann@x.com" }]);
});

test("a byte-order mark, blank lines and escaped quotes are handled", () => {
  const rows = parseRoster('\uFEFFname,table,captain name,captain email\r\n\r\n"The ""Fixers""",3,Cy,cy@x.com\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'The "Fixers"');
  assert.equal(rows[0].line, 3);
});
