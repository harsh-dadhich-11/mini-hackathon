"use client";

import { useEffect, useRef } from "react";

const POLL_TIMEOUT_MS = 8000;

/**
 * Calls `poll` every `ms`, waiting for each call to finish before scheduling the next, so slow responses never
 * pile up. Each call gets a signal that aborts after 8 s, so one hung request can't freeze the screen, and a
 * phone that wakes up or reconnects polls straight away instead of waiting out a stale timer.
 */
export function usePoll(poll: (signal: AbortSignal) => Promise<void>, ms: number) {
  const latest = useRef(poll);
  useEffect(() => {
    latest.current = poll;
  });

  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer = 0;
    let controller: AbortController | null = null;

    const tick = async () => {
      window.clearTimeout(timer);
      if (running || stopped) return;
      running = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), POLL_TIMEOUT_MS);
      try {
        await latest.current(controller.signal);
      } catch {
        // A failed poll is retried on the next tick.
      } finally {
        window.clearTimeout(timeout);
        running = false;
      }
      if (!stopped) timer = window.setTimeout(tick, ms + jitter());
    };

    // A little randomness, so a room of phones reconnecting to Wi-Fi together doesn't hit the server in one burst.
    const jitter = () => Math.round((Math.random() - 0.5) * 400);
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, Math.random() * 600);
    };

    timer = window.setTimeout(tick, ms);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [ms]);
}
