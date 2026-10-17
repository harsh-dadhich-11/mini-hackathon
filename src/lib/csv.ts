// Pure roster parsing, unit tested. Accepts CSV (quoted cells may contain commas) or tab-separated text pasted from a spreadsheet.

/** Accepted spellings for each header cell. A header must match exactly, so a team called "Email Ninjas" is never skipped. */
const HEADER = [["name", "team", "team name"], ["table", "table number", "table no"], ["captain", "captain name"], ["email", "captain email"]];

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

const isHeader = (cells: string[]) =>
  cells.length >= 4 && cells.slice(0, 4).every((cell, index) => HEADER[index].includes(cell.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")));

export type RosterRow = { line: number; name: string; tableNumber: string; captainName: string; captainEmail: string };

/** One team per line: name, table, Captain name, Captain email. A header row is skipped only if it matches those column names. */
export function parseRoster(text: string): RosterRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const rows: RosterRow[] = [];
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = splitLine(raw, delimiter);
    if (rows.length === 0 && isHeader(cells)) return;
    const [name = "", tableNumber = "", captainName = "", captainEmail = ""] = cells;
    rows.push({ line: index + 1, name, tableNumber, captainName, captainEmail });
  });
  return rows;
}
