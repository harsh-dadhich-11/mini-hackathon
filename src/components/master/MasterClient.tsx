"use client";

import { useEffect, useRef, useState } from "react";
import { MailWarning, ShieldCheck, WifiOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { postJson, requestJson } from "@/lib/api";
import { usePoll } from "@/lib/hooks/usePoll";
import { useHydrated } from "@/lib/hooks/useServerClock";
import { cn } from "@/lib/utils";
import { AuditTab } from "./AuditTab";
import { LiveTab } from "./LiveTab";
import { ProjectorTab } from "./ProjectorTab";
import { ResultsTab } from "./ResultsTab";
import { RoundsTab } from "./RoundsTab";
import { TeamsTab } from "./TeamsTab";
import type { Act, Overview } from "./types";

const TABS = [
  ["live", "Live control"],
  ["results", "Qualify & awards"],
  ["projector", "Screen control"],
  ["teams", "Teams"],
  ["rounds", "Questions"],
  ["audit", "Audit log"],
] as const;
type Tab = (typeof TABS)[number][0];

const POLL_MS = 3000;
export function MasterClient({ initial, viewerName }: { initial: Overview; viewerName: string }) {
  const [overview, setOverview] = useState(initial);
  const [tab, setTab] = useState<Tab>("live");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [connection, setConnection] = useState<"ok" | "offline" | "error" | "signed-out">("ok");
  // The Audit tab asks for the long log; every other poll stays small.
  const tabRef = useRef<Tab>("live");
  useEffect(() => { tabRef.current = tab; }, [tab]);
  // Master device clock minus server clock, for countdowns.
  const [serverOffset, setServerOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  // Bumped by every action, so a poll that started before it can't put the old state back on screen.
  const mutation = useRef(0);

  async function refresh(signal?: AbortSignal) {
    const seq = mutation.current;
    const sentAt = Date.now();
    const result = await requestJson<Overview>(tabRef.current === "audit" ? "/api/master?audit=full" : "/api/master", { signal });
    if (!result.ok) {
      setConnection(result.status === 401 ? "signed-out" : result.status === 0 ? "offline" : "error");
      return;
    }
    setConnection("ok");
    if (seq !== mutation.current) return;
    setServerOffset(Date.parse(result.data.serverNow) - (sentAt + Date.now()) / 2);
    setOverview(result.data);
  }

  usePoll(refresh, POLL_MS);

  const act: Act = async (payload, success) => {
    mutation.current += 1;
    setBusy(true);
    try {
      const response = await postJson<{ result: unknown }>("/api/master", payload);
      if (!response.ok) {
        if (response.status === 401) setConnection("signed-out");
        setNotice({ text: response.error, error: true });
        return undefined;
      }
      const text = typeof success === "function" ? success(response.data.result) : success;
      if (text) setNotice({ text });
      return response.data.result ?? null;
    } finally {
      mutation.current += 1;
      await refresh();
      setBusy(false);
    }
  };

  async function signOut() {
    await postJson("/api/master-auth/signout");
    window.location.reload();
  }

  /** For a laptop left signed in somewhere: ends every Master session, this one included. */
  async function signOutEverywhere() {
    if (!window.confirm("Sign out every Master session on every device, including this one? Each Master then signs in again with a code.")) return;
    await act({ action: "sign-out-all-masters" });
    window.location.reload();
  }

  // Times and countdowns use this device's clock and time zone, so render the workspace on the client only.
  const hydrated = useHydrated();
  const shared = { overview, act, busy, setNotice, serverOffset };
  if (!hydrated) return <main className="min-h-screen bg-surface"><Navbar active="master" /></main>;
  const activeTeams = overview.teams.filter((team) => team.isActive).length;
  const questionsLoaded = overview.rounds.filter((round) => round.scenario).length;
  const eventReady = activeTeams > 0 && questionsLoaded === overview.rounds.length;

  return (
    <main className="min-h-screen bg-surface">
      <Navbar active="master" />
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="kicker mb-2 flex items-center gap-2 text-teal-mid"><ShieldCheck size={14} /> Master workspace</p>
            <h1 className="font-display text-h1 text-ink">Event control</h1>
            <p className="mt-2 text-sm text-muted">Signed in as {viewerName}. Every change is recorded in the audit log. <button type="button" onClick={signOut} className="font-semibold text-teal-mid hover:underline">Sign out</button> · <button type="button" onClick={signOutEverywhere} className="font-semibold text-muted hover:text-danger hover:underline">Sign out all Masters</button></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-rule bg-white px-4 py-2 text-sm font-semibold text-ink">{activeTeams}/30 teams</span>
            <span className="rounded-full border border-rule bg-white px-4 py-2 text-sm font-semibold text-ink">{questionsLoaded}/{overview.rounds.length} questions loaded</span>
          </div>
        </div>

        {connection === "signed-out" && <Notice tone="danger" className="mb-4 flex flex-wrap items-center justify-between gap-3" role="alert"><span>Your Master session has ended, so changes can&apos;t be saved. The projector is unaffected if it uses a projector link.</span><Button variant="primary" onClick={() => window.location.reload()}>Sign in again</Button></Notice>}
        {connection === "offline" && <Notice tone="warning" className="mb-4 flex items-center gap-2" role="status"><WifiOff size={16} /> Reconnecting… the console will refresh as soon as the connection is back.</Notice>}
        {connection === "error" && <Notice tone="warning" className="mb-4 flex items-center gap-2" role="status"><WifiOff size={16} /> Having trouble reaching the server. The console keeps retrying; what you see may be a few seconds old.</Notice>}
        {overview.emailFailing && <Notice tone="danger" className="mb-4 flex items-center gap-2"><MailWarning size={16} /> The last sign-in email did not go out. Check RESEND_API_KEY and RESEND_FROM_EMAIL on the host, then use Resend OTP.</Notice>}
        {!eventReady && <Notice tone="warning" className="mb-5">{activeTeams === 0 ? "Captain sign-in and the projector wake up as soon as there is at least one active team. Add your roster in the Teams tab." : `${questionsLoaded}/${overview.rounds.length} questions are loaded. Finish them in the Questions tab before opening the remaining rounds.`}</Notice>}

        <nav className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-rule bg-white p-1" aria-label="Master sections">
          {TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors", tab === key ? "bg-teal-dark text-cream" : "text-muted hover:bg-surface-sunk hover:text-ink")}>{label}</button>)}
        </nav>

        {notice && (
          <div role="status" className={cn("tile sticky top-20 z-10 mb-5 flex items-start justify-between gap-4 border px-4 py-3 text-sm font-medium shadow-sm", notice.error ? "border-danger/30 bg-panel-danger text-danger" : "border-success/30 bg-panel-success text-success")}>
            <span className="whitespace-pre-line">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 font-semibold">Dismiss</button>
          </div>
        )}

        {tab === "live" && <LiveTab {...shared} />}
        {tab === "results" && <ResultsTab {...shared} />}
        {tab === "projector" && <ProjectorTab {...shared} />}
        {tab === "teams" && <TeamsTab {...shared} />}
        {tab === "rounds" && <RoundsTab {...shared} />}
        {tab === "audit" && <AuditTab overview={overview} />}
      </section>
    </main>
  );
}
