"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * If a page fails to render (e.g. the database blinked while a phone loaded /team), show a calm message and try
 * again on its own after five seconds, so a Captain or the projector never sits on an error page.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const timer = window.setTimeout(() => retry(), 5000);
    return () => window.clearTimeout(timer);
  }, [error, retry]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="card max-w-md p-8 text-center">
        <p className="kicker text-accent">Boardroom Challenge</p>
        <h1 className="mt-2 font-display text-h2 text-ink">Reconnecting…</h1>
        <p className="mt-3 text-muted">The server didn&apos;t answer in time. This page tries again by itself in a few seconds. Saved answers are safe.</p>
        <button type="button" onClick={() => retry()} className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white"><RefreshCw size={16} /> Try again now</button>
      </div>
    </main>
  );
}
