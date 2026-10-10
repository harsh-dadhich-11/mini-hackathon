"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock3, LogOut, Pause, UsersRound } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import type { getTeamState } from "@/lib/event-store";
import { useHydrated, useServerClock } from "@/lib/use-server-clock";

type TeamState = Awaited<ReturnType<typeof getTeamState>>;

const POLL_MS = 2000;

function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

export function TeamClient({ initial }: { initial: TeamState }) {
  const [state, setState] = useState(initial);
  const { serverNowMs, sync } = useServerClock(initial.serverNow);
  const hydrated = useHydrated();
  const [picks, setPicks] = useState<string[]>(initial.submission?.choices ?? []);
  const [roundId, setRoundId] = useState(initial.round?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const poll = window.setInterval(async () => {
      const response = await fetch("/api/team/state", { cache: "no-store" }).catch(() => null);
      if (response?.status === 401) { window.location.reload(); return; }
      if (!response?.ok) return;
      const next = await response.json() as TeamState;
      sync(next.serverNow);
      setState(next);
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [sync]);

  // A new round starts with that round's saved answer (or a blank slate).
  if ((state.round?.id ?? null) !== roundId) {
    setRoundId(state.round?.id ?? null);
    setPicks(state.submission?.choices ?? []);
    setError("");
  }

  const round = state.round;
  const isOpen = round?.state === "open" && round.inputMode !== "master-paddle";
  const remainingMs = round?.state === "paused" ? round.pausedRemainingMs ?? 0 : isOpen && round.closesAt ? Date.parse(round.closesAt) - serverNowMs : 0;
  const saved = state.submission;
  const unsaved = isOpen && picks.length === 3 && picks.join() !== saved?.choices.join();

  function choose(choice: string) {
    if (!isOpen) return;
    setError("");
    setPicks((current) => current.includes(choice) ? current.filter((item) => item !== choice) : current.length === 3 ? current : [...current, choice]);
  }

  async function submit() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/team/submission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choices: picks }) });
    const payload = await response.json() as { error?: string; result?: { updatedAt: string } };
    setSaving(false);
    if (!response.ok || !payload.result) { setError(payload.error ?? "Your answer could not be saved."); return; }
    setState((current) => ({ ...current, submission: { choices: picks, updatedAt: payload.result!.updatedAt } }));
  }

  async function signOut() {
    await fetch("/api/captain/signout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-[#eff4f2]">
      <BoardroomNav active="team" />
      <section className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 flex items-center gap-3 text-sm font-semibold text-[#0e6a68]">{state.team.name} · Table {state.team.tableNumber}<button onClick={signOut} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700"><LogOut size={13} /> Sign out</button></p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c]">{round ? round.title : "Waiting for the first round"}</h1>
          </div>
          {round && (isOpen || round.state === "paused") && (
            <div className={"rounded-2xl px-5 py-3 text-right text-white " + (round.state === "paused" ? "bg-amber-600" : remainingMs < 30_000 ? "bg-rose-700" : "bg-[#083f41]")}>
              <p className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">{round.state === "paused" ? <><Pause size={12} /> Paused</> : "Time remaining"}</p>
              <p className="font-mono text-3xl font-bold" aria-live="off">{formatSeconds(remainingMs)}</p>
            </div>
          )}
        </div>

        {!round ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><Clock3 className="mb-5 text-[#0e6a68]" size={28} /><h2 className="font-display text-2xl font-bold text-slate-900">You&apos;re signed in.</h2><p className="mt-3 text-slate-600">Keep this screen open. The scenario appears here automatically when the emcee opens the round.</p></div>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {state.standing === "playing-along" && <div className="mb-5 flex gap-3 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm leading-6 text-[#275c58]"><UsersRound className="mt-0.5 shrink-0" size={19} /><p><strong>You&apos;re playing along.</strong> Keep submitting. Your answers count towards the Audience Champion, not the official scorecard.</p></div>}
            {round.inputMode === "master-paddle" ? <div className="mb-5 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm font-semibold text-[#275c58]">You&apos;re on the stage. Make your paddle choice; a Master records it on the control console.</div> : !isOpen && round.state !== "paused" && <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">This round is closed. Watch the main screen for the Boardroom Choices.</div>}
            <div className="max-w-3xl border-b border-slate-200 pb-6">
              <p className="text-sm font-semibold text-[#0e6a68]">The Board speaks{round.multiplier > 1 ? ` · ${round.multiplier}× points` : ""}</p>
              <h2 className="mt-2 whitespace-pre-line font-display text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">{round.scenario}</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">Pick your three strongest options, in ranked order. Tap again to remove.</p>
            </div>
            <div className="my-6 flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm font-semibold text-slate-700">Your ranking</span>
              {[0, 1, 2].map((index) => <span key={index} className={"inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-bold " + (picks[index] ? "border-[#0e6a68] bg-[#e3f2ee] text-[#075c58]" : "border-slate-200 bg-slate-50 text-slate-400")}><small>#{index + 1}</small>{picks[index] || "—"}</span>)}
              {isOpen && <button onClick={() => setPicks([])} className="ml-1 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {round.options.map((option) => {
                const place = picks.indexOf(option.id);
                return <button key={option.id} disabled={!isOpen} onClick={() => choose(option.id)} className={"flex min-h-[80px] items-start gap-4 rounded-2xl border p-4 text-left transition disabled:cursor-default " + (place >= 0 ? "border-[#0e6a68] bg-[#e5f3ef] shadow-sm" : "border-slate-200 enabled:hover:border-[#74a6a2] enabled:hover:bg-[#f7fbf9]")}><span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold " + (place >= 0 ? "bg-[#0d5c5c] text-white" : "bg-slate-100 text-slate-600")}>{place >= 0 ? "#" + (place + 1) : option.id}</span><span className="pr-1 text-sm leading-6 text-slate-700"><strong className="mr-1 text-slate-900">{option.id}.</strong>{option.text}</span></button>;
              })}
            </div>
            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
              <p className={"text-sm " + (error ? "font-semibold text-rose-700" : saved && !unsaved ? "font-semibold text-[#0b605c]" : "text-slate-500")} role="status">
                {error || (saved
                  ? unsaved ? "You have unsaved changes." : `Saved ✓ ${saved.choices.map((choice, index) => `#${index + 1} ${choice}`).join(" · ")} at ${hydrated ? new Date(saved.updatedAt).toLocaleTimeString() : "…"}`
                  : isOpen ? "One answer per team. You can change it until time runs out." : "No answer was saved for this round.")}
              </p>
              {isOpen && <button disabled={picks.length !== 3 || saving || !unsaved} onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5c5c] disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving…" : saved && !unsaved ? <><Check size={17} /> Saved</> : <>{saved ? "Update answer" : "Lock it in"} <ChevronRight size={17} /></>}</button>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
