"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during server rendering and hydration, true afterwards. Gate device-local output (time zones, clocks) on it. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Server time in ms, ticking locally four times a second, so every device counts down to the same
 * server deadline whatever its own clock says. Call `sync` with each response's `serverNow`.
 * The first render uses `initialServerNow` exactly, so server and client markup match.
 */
export function useServerClock(initialServerNow: string) {
  const [offset, setOffset] = useState(() => Date.parse(initialServerNow) - Date.now());
  const [deviceNow, setDeviceNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setDeviceNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const sync = useCallback((serverNow: string) => setOffset(Date.parse(serverNow) - Date.now()), []);
  return { serverNowMs: deviceNow === null ? Date.parse(initialServerNow) : deviceNow + offset, sync };
}
