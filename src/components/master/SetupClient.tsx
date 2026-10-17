"use client";

import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { Notice } from "@/components/ui/Notice";
import { postJson } from "@/lib/api";

export function SetupClient({ viewerName }: { viewerName: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function bootstrap() {
    setWorking(true);
    setError("");
    const result = await postJson("/api/setup");
    if (result.ok) { window.location.reload(); return; }
    setWorking(false);
    setError(result.error);
  }

  return (
    <main className="min-h-screen bg-surface">
      <Navbar active="master" />
      <section className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="card card-xl p-8 shadow-[0_20px_50px_rgba(24,57,68,0.10)]">
          <div className="mb-6 flex items-center justify-between">
            <span className="tile grid h-12 w-12 place-items-center bg-panel-orange text-accent-deep"><LockKeyhole size={22} /></span>
            <Mascot className="h-20" />
          </div>
          <p className="kicker text-teal-mid">Secure event setup</p>
          <h1 className="mt-2 font-display text-h2 text-ink">Configure the event.</h1>
          <p className="mt-3 leading-7 text-muted">Signed in as {viewerName}. This one-time step creates the six-round schedule. Add the Captain roster and load the questions next.</p>
          <Notice className="mt-6 flex gap-2"><ShieldCheck size={17} className="mt-1 shrink-0" /> The site remains private during initial setup. Do this before opening access to Captains.</Notice>
          <Button variant="primary" size="lg" onClick={bootstrap} disabled={working} className="mt-7 w-full">{working ? "Configuring event…" : "Configure secure event"}</Button>
          {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        </div>
      </section>
    </main>
  );
}
