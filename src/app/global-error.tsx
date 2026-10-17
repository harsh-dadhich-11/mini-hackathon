"use client";

import { useEffect } from "react";

/** Last-resort error page (the root layout itself failed). Reloads on its own after five seconds. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const timer = window.setTimeout(() => window.location.reload(), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf5ee", color: "#183944", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <title>Boardroom Challenge · Reconnecting</title>
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Reconnecting…</h1>
          <p style={{ color: "#5b6b70" }}>The server didn&apos;t answer in time. This page reloads by itself in a few seconds. Saved answers are safe.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 16, border: 0, borderRadius: 999, padding: "12px 24px", background: "#f16522", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Try again now</button>
        </div>
      </body>
    </html>
  );
}
