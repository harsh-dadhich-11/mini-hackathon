"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { useHydrated } from "@/lib/use-server-clock";
import { ShieldCheck } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import { AuditTab } from "./audit-tab";
import { LiveTab } from "./live-tab";
import type { Act, Overview } from "./master-ui";
import { ProjectorTab } from "./projector-tab";
import { ResultsTab } from "./results-tab";
import { RoundsTab } from "./rounds-tab";
import { TeamsTab } from "./teams-tab";

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
  // Master device clock minus server clock, for countdowns.
  const [serverOffset, setServerOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());

  async function refresh() {
    const response = await fetch("/api/master", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = await response.json() as Overview;
    setServerOffset(Date.parse(next.serverNow) - Date.now());
    setOverview(next);
  }

  usePoll(refresh, POLL_MS);

  const act: Act = async (payload, success) => {
    setBusy(true);
    try {
      const response = await fetch("/api/master", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string; result?: unknown };
      if (!response.ok) throw new Error(body.error ?? "The change could not be saved.");
      if (success) setNotice({ text: success });
      await refresh();
      return body.result;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "The change could not be saved.", error: true });
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  async function signOut() {
    await fetch("/api/master-auth/signout", { method: "POST" });
    window.location.reload();
  }

  // Times and countdowns use this device's clock and time zone, so render the workspace on the client only.
  const hydrated = useHydrated();
  const shared = { overview, act, busy, setNotice, serverOffset };
  if (!hydrated) return <main className="min-h-screen bg-[#eff4f2]"><BoardroomNav active="master" /></main>;
  const activeTeams = overview.teams.filter((team) => team.isActive).length;
  const questionsLoaded = overview.rounds.filter((round) => round.scenario).length;
  const eventReady = activeTeams > 0 && questionsLoaded === overview.rounds.length;

  return (
    <main className="min-h-screen bg-[#eff4f2]">
      <BoardroomNav active="master" />
      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0e6a68]"><ShieldCheck size={15} /> Master workspace</p><h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c]">Event control</h1><p className="mt-1 text-sm text-slate-600">Signed in as {viewerName}. Every change is recorded in the audit log. <button type="button" onClick={signOut} className="font-semibold text-[#0e6a68] hover:underline">Sign out</button></p></div>
          <div className="flex gap-2"><span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">{activeTeams}/30 teams</span><span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">{questionsLoaded}/{overview.rounds.length} questions loaded</span></div>
        </div>

        {!eventReady && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{activeTeams === 0 ? "Captain sign-in and the public display wake up as soon as there is at least one active team. Add your roster in the Teams tab." : `${questionsLoaded}/${overview.rounds.length} questions are loaded. Finish them in the Questions tab before opening the remaining rounds.`}</div>}

        <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1" aria-label="Master sections">
          {TABS.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={"rounded-lg px-4 py-2 text-sm font-semibold " + (tab === key ? "bg-[#073f41] text-white" : "text-slate-600 hover:bg-slate-100")}>{label}</button>)}
        </nav>

        {notice && <div role="status" className={"sticky top-2 z-10 mb-5 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm " + (notice.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#cde1d9] bg-[#f6fbf9] text-[#275c58]")}><span className="whitespace-pre-line">{notice.text}</span><button onClick={() => setNotice(null)} className="shrink-0 font-semibold">Dismiss</button></div>}

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
