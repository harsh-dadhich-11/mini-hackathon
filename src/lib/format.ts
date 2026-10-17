// Small display helpers shared by the Captain, projector and Master screens.

export function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

/** Local time of day for an ISO timestamp. Client-only: it depends on the device's time zone. */
export const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "—");

/** Emergency overrides need a reason for the audit log. */
export function askReason(what: string) {
  const reason = window.prompt(`Reason for ${what} (recorded in the audit log):`);
  return reason?.trim() ? reason.trim() : null;
}

/** Three ranked option letters from "A,C,F", "A C F" or "ACF". Returns null unless there are exactly three different ones. */
export function parseLetters(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z]/g, "");
  const letters = /[\s,;]/.test(raw.trim()) ? raw.toUpperCase().split(/[\s,;]+/).filter(Boolean) : compact.split("");
  return letters.length === 3 && new Set(letters).size === 3 && letters.every((letter) => /^[A-Z]$/.test(letter)) ? letters : null;
}

/** A whole number of points from 0 to 100, blank for "clear the override", or "invalid". */
export function parsePoints(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^\d{1,3}$/.test(value)) return "invalid";
  const points = Number(value);
  return points <= 100 ? points : "invalid";
}
