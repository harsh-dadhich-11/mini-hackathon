"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during server rendering and hydration, true afterwards. Gate device-local output (time zones, clocks) on it. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** A sample is trusted if its round trip is close to the best seen; any sample is taken after 30 s to follow clock drift. */
const RTT_SLACK_MS = 150;
const REFRESH_MS = 30_000;

/**
 * Server time in ms, so every device counts down to the same server deadline whatever its own clock says. It ticks
 * locally four times a second only while `active` (something is counting down), so idle screens don't re-render
 * constantly on low-end phones; every poll's `sync` still moves it on.
 * Call `sync(serverNow, sentAt, receivedAt)` with each response: the offset is taken at the request's midpoint, and
 * only from fast round trips, so a slow network doesn't hand a phone extra seconds.
 * The first render uses `initialServerNow` exactly, so server and client markup match.
 */
export function useServerClock(initialServerNow: string, active = true) {
  const [offset, setOffset] = useState(() => Date.parse(initialServerNow) - Date.now());
  const [deviceNow, setDeviceNow] = useState<number | null>(null);
  const best = useRef({ rtt: Number.POSITIVE_INFINITY, at: 0 });

  useEffect(() => {
    if (!active) return;
    const tick = () => setDeviceNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [active]);

  const sync = useCallback((serverNow: string, sentAt: number, receivedAt: number) => {
    setDeviceNow(Date.now());
    const rtt = Math.max(0, receivedAt - sentAt);
    const stale = receivedAt - best.current.at > REFRESH_MS;
    if (!stale && rtt > best.current.rtt + RTT_SLACK_MS) return;
    best.current = { rtt: stale ? rtt : Math.min(rtt, best.current.rtt), at: receivedAt };
    setOffset(Date.parse(serverNow) - (sentAt + receivedAt) / 2);
  }, []);

  return { serverNowMs: deviceNow === null ? Date.parse(initialServerNow) : deviceNow + offset, sync };
}
