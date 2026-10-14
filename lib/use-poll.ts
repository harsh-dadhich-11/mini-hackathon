"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `poll` every `ms`, waiting for each call to finish before scheduling the next,
 * so slow responses never pile up behind each other.
 */
export function usePoll(poll: () => Promise<void>, ms: number) {
  const latest = useRef(poll);
  useEffect(() => {
    latest.current = poll;
  });

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        await latest.current();
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!stopped) timer = window.setTimeout(tick, ms);
    };
    timer = window.setTimeout(tick, ms);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [ms]);
}
