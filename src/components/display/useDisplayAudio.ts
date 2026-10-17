"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { soundboard, type LoopCue, type OneShotCue } from "@/lib/audio/soundboard";
import { debateSegment, type SegmentKey } from "@/lib/game/segments";
import type { PublicDisplay } from "./DisplayClient";

/** Whether this tab may play sound yet, and the operator's local mute. */
export function useSoundState() {
  return useSyncExternalStore(soundboard.subscribe, soundboard.getSnapshot, soundboard.getServerSnapshot);
}

/** Time left on whatever is counting down on screen (a question or a sudden death), and whether it is live. */
export function countdown(display: PublicDisplay, nowMs: number) {
  if (display.mode === "question") {
    if (display.state === "paused") return { remaining: display.pausedRemainingMs ?? 0, running: false, paused: true };
    const remaining = display.state === "open" && display.closesAt ? Date.parse(display.closesAt) - nowMs : 0;
    return { remaining, running: remaining > 0, paused: false };
  }
  if (display.mode === "sudden-death") {
    const remaining = display.state === "open" ? Date.parse(display.closesAt) - nowMs : 0;
    return { remaining, running: remaining > 0, paused: false };
  }
  return { remaining: 0, running: false, paused: false };
}

/** A moment that gets a one-off sound the first time it appears: a question opening, a new board, the principle. */
function eventOf(display: PublicDisplay, nowMs: number): { key: string; cue: OneShotCue } | null {
  const { running } = countdown(display, nowMs);
  switch (display.mode) {
    case "question": return running ? { key: `question:${display.title}`, cue: "hit" } : null;
    case "standings": return { key: `standings:${display.label}:${display.publishedAt}`, cue: "whoosh" };
    case "reveal": return display.step >= 4 ? { key: `principle:${display.title}`, cue: "chime" } : null;
    case "sudden-death": return running ? { key: `sudden:${display.id}`, cue: "hit" } : null;
    default: return null;
  }
}

function loopFor(display: PublicDisplay, segment: SegmentKey | null, running: boolean, paused: boolean, remaining: number): LoopCue | null {
  switch (display.mode) {
    case "idle":
    case "standings":
      return "lobby";
    case "question":
      if (paused) return "think-soft";
      if (!running) return null;
      if (display.phase === "trial") return remaining <= 30_000 ? "tension" : "think";
      return segment === "silent" ? "think-soft" : segment === "lock" ? "tension" : "think";
    case "sudden-death":
      return running ? "sudden-death" : null;
    default:
      // Reveals play on silence, so the drumroll and the sting carry the moment.
      return null;
  }
}

/**
 * The projector soundtrack: the music bed follows what is on screen (and the debate segment), with ticks in the
 * last ten seconds and a buzzer at time-up. Reveal drumrolls and stings are played by the suspense logic in
 * DisplayClient, so they line up with the card landing.
 */
export function useDisplayAudio(display: PublicDisplay, nowMs: number, initial: PublicDisplay) {
  const { remaining, running, paused } = countdown(display, nowMs);
  const segment = display.mode === "question" && display.phase !== "trial" && (running || paused) ? debateSegment(remaining).key : null;
  const loop = loopFor(display, segment, running, paused, remaining);
  const secondsLeft = running ? Math.ceil(remaining / 1000) : null;
  const item = display.mode === "question" ? `question:${display.title}` : display.mode === "sudden-death" ? `sudden:${display.id}` : null;
  const event = eventOf(display, nowMs);
  const seen = useRef(new Set([eventOf(initial, Date.parse(initial.serverNow))?.key].filter(Boolean) as string[]));
  const live = useRef<string | null>(null);
  const lastSegment = useRef<SegmentKey | null>(null);

  useEffect(() => { soundboard.init(); }, []);

  const { music, sfx } = display.audio;
  useEffect(() => { soundboard.setEnabled({ music, sfx }); }, [music, sfx]);

  useEffect(() => { soundboard.loop(loop); }, [loop]);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 10) soundboard.play("tick");
  }, [secondsLeft]);

  // Time-up buzzer: only when the countdown on screen runs out (or is closed), not when the screen moves elsewhere.
  useEffect(() => {
    if (paused) return;
    if (running && item) { live.current = item; return; }
    if (live.current && live.current === item) soundboard.play("buzzer");
    live.current = null;
  }, [running, paused, item]);

  // A chime as each debate segment begins; a hit for "Lock now".
  useEffect(() => {
    if (segment && lastSegment.current && segment !== lastSegment.current) soundboard.play(segment === "lock" ? "hit" : "chime");
    lastSegment.current = segment;
  }, [segment]);

  const eventKey = event?.key ?? null;
  const eventCue = event?.cue ?? null;
  useEffect(() => {
    if (!eventKey || !eventCue || seen.current.has(eventKey)) return;
    seen.current.add(eventKey);
    soundboard.play(eventCue);
  }, [eventKey, eventCue]);
}
