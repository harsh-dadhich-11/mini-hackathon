// The deck's five-minute debate, mapped onto the 6:00 server timer. Pure, so it is shared by the projector,
// the Captain screen and the soundtrack, and tested with `npm test`.
// Segments are keyed off time *remaining*, so an emergency Extend lengthens the lock window, not the silent pick.

export type SegmentKey = "silent" | "hats" | "debate" | "close" | "lock";

export type Segment = { key: SegmentKey; label: string; detail: string; /** The segment runs while more than this much time remains. */ untilMs: number };

export const SEGMENTS: readonly Segment[] = [
  { key: "silent", label: "Silent pick", detail: "Write your own #1. Reveal together.", untilMs: 300_000 },
  { key: "hats", label: "Hat round", detail: "30 seconds per hat, lead hat first.", untilMs: 180_000 },
  { key: "debate", label: "Open debate", detail: "The Advisor asks, and speaks last.", untilMs: 90_000 },
  { key: "close", label: "Close", detail: "Sum up. The Submitter reads back.", untilMs: 60_000 },
  { key: "lock", label: "Lock now", detail: "Captains: lock your three ranked picks.", untilMs: 0 },
];

/** The segment running with `remainingMs` left on the clock. At or below zero it stays on "lock". */
export function debateSegment(remainingMs: number): Segment {
  return SEGMENTS.find((segment) => remainingMs > segment.untilMs) ?? SEGMENTS[SEGMENTS.length - 1];
}
