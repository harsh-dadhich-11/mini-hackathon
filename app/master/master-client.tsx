"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, LockKeyhole, Mail, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Overview = {
  teams: { id: string; name: string; tableNumber: string; captainName: string; captainEmail: string }[];
  masters: { email: string; displayName: string }[];
  rounds: { id: string; roundOrder: number; title: string; phase: string; durationSeconds: number; state: string; scenario: string; optionsJson: string; answersJson: string; multiplier: number }[];
  submissions: { roundId: string; count: number }[];
};

type RoundDraft = { id: string; title: string; scenario: string; options: { id: string; text: string }[]; answers: string[] };

function readOptions(value: string) {
  try {
    const parsed = JSON.parse(value) as { id?: string; text?: string }[];
    if (Array.isArray(parsed) && parsed.length === 8) return parsed.map((option, index) => ({ id: option.id || String.fromCharCode(65 + index), text: option.text || "" }));
  } catch {}
  return Array.from({ length: 8 }, (_, index) => ({ id: String.fromCharCode(65 + index), text: "" }));
}

function readAnswers(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.length === 3 ? parsed : ["A", "B", "C"]; } catch { return ["A", "B", "C"]; }
}

async function mutation(payload: Record<string, unknown>) {
  const response = await fetch("/api/master", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The update could not be saved.");
  return body;
}

export function MasterClient({ initial, viewerName }: { initial: Overview; viewerName: string }) {
  const [overview, setOverview] = useState(initial);
  const [team, setTeam] = useState({ name: "", tableNumber: "", captainName: "", captainEmail: "" });
  const [master, setMaster] = useState({ displayName: "", email: "" });
  const [roundDraft, setRoundDraft] = useState<RoundDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const configuredRounds = useMemo(() => overview.rounds.filter((round) => round.scenario && readOptions(round.optionsJson).every((option) => option.text) && readAnswers(round.answersJson).length === 3).length, [overview.rounds]);

  async function refresh() {
    const response = await fetch("/api/master", { cache: "no-store" });
    if (response.ok) setOverview(await response.json() as Overview);
  }
  async function addTeam(event: FormEvent) {
    event.preventDefault();
    setBusy("team");
    try { await mutation({ action: "add-team", ...team }); setTeam({ name: "", tableNumber: "", captainName: "", captainEmail: "" }); setNotice("Captain access added."); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to add the Captain."); } finally { setBusy(null); }
  }
  async function addMaster(event: FormEvent) {
    event.preventDefault();
    setBusy("master");
    try { await mutation({ action: "add-master", ...master }); setMaster({ displayName: "", email: "" }); setNotice("Master access added."); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to add the Master."); } finally { setBusy(null); }
  }
  async function control(roundId: string, controlAction: "open" | "close" | "score-publish", rankLimit?: number) {
    setBusy(roundId + controlAction);
    try { const result = await mutation({ action: "round-control", control: controlAction, roundId, rankLimit }); setNotice(controlAction === "score-publish" ? String((result as { result?: { label?: string } }).result?.label ?? "Leaderboard") + " published." : controlAction === "open" ? "Round opened with its fixed server timer." : "Round closed."); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to control this round."); } finally { setBusy(null); }
  }
  function editRound(round: Overview["rounds"][number]) {
    setRoundDraft({ id: round.id, title: round.title, scenario: round.scenario, options: readOptions(round.optionsJson), answers: readAnswers(round.answersJson) });
    setNotice("");
  }
  async function saveRound(event: FormEvent) {
    event.preventDefault();
    if (!roundDraft) return;
    setBusy("round-config");
    try {
      await mutation({ action: "update-round", ...roundDraft });
      setNotice("Round content saved. It remains editable until opened.");
      setRoundDraft(null);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save the round."); } finally { setBusy(null); }
  }

  return (
    <main className="min-h-screen bg-[#eff4f2]">
      <BoardroomNav active="master" />
      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0e6a68]"><ShieldCheck size={15} /> Secure Master workspace</p><h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c]">Control the event, not the teams.</h1><p className="mt-2 text-slate-600">Signed in as {viewerName}. All Master changes are recorded in the event audit log.</p></div><div className="flex gap-2"><span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">{overview.teams.length}/30 Captain teams</span><span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">{configuredRounds}/9 rounds loaded</span></div></div>

        {notice && <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[#cde1d9] bg-[#f6fbf9] px-4 py-3 text-sm font-medium text-[#275c58]"><span>{notice}</span><button onClick={() => setNotice("")} className="text-[#0e6a68]">Dismiss</button></div>}
        <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#0e6a68]">Captain access</p><h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Team roster</h2></div><span className="rounded-lg bg-[#eaf5ef] px-3 py-2 text-sm font-semibold text-[#0e6a68]">One Captain per team</span></div>
              <form onSubmit={addTeam} className="mb-6 grid gap-3 rounded-2xl bg-[#f4f8f6] p-4 sm:grid-cols-2"><input required value={team.name} onChange={(event) => setTeam({ ...team, name: event.target.value })} placeholder="Team name" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /><input required value={team.tableNumber} onChange={(event) => setTeam({ ...team, tableNumber: event.target.value })} placeholder="Table number" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /><input required value={team.captainName} onChange={(event) => setTeam({ ...team, captainName: event.target.value })} placeholder="Captain name" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /><input required type="email" value={team.captainEmail} onChange={(event) => setTeam({ ...team, captainEmail: event.target.value })} placeholder="Captain email" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /><button disabled={busy === "team"} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#083f41] px-4 text-sm font-semibold text-white hover:bg-[#0d5c5c] disabled:bg-slate-300 sm:col-span-2"><Plus size={16} /> {busy === "team" ? "Adding…" : "Add Captain access"}</button></form>
              <Table><TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Table</TableHead><TableHead>Captain</TableHead><TableHead>Authenticated email</TableHead></TableRow></TableHeader><TableBody>{overview.teams.map((entry) => <TableRow key={entry.id}><TableCell className="font-semibold">{entry.name}</TableCell><TableCell>{entry.tableNumber}</TableCell><TableCell>{entry.captainName}</TableCell><TableCell className="font-mono text-xs text-slate-500">{entry.captainEmail}</TableCell></TableRow>)}</TableBody></Table>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-semibold text-[#0e6a68]">Fixed timing & scoring</p><h2 className="mb-5 font-display text-2xl font-bold tracking-tight text-slate-900">Round control</h2><div className="space-y-3">{overview.rounds.map((round) => { const submissions = overview.submissions.find((item) => item.roundId === round.id)?.count ?? 0; const rankLimits = round.id === "round-4" ? [10, 5] : round.phase === "prelim" ? [10] : [2]; return <div key={round.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{round.roundOrder}. {round.title}</p><p className="mt-1 text-xs text-slate-500">{round.phase} · {Math.round(round.durationSeconds / 60)} min · {round.multiplier}× · {submissions} submissions</p></div><span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (round.state === "open" ? "bg-emerald-50 text-emerald-700" : round.state === "revealed" ? "bg-[#eaf5ef] text-[#0e6a68]" : "bg-slate-100 text-slate-500")}>{round.state}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => editRound(round)} disabled={round.state !== "draft"} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Edit question</button><button onClick={() => control(round.id, "open")} disabled={busy === round.id + "open" || round.state !== "draft"} className="rounded-lg border border-[#0e6a68] px-3 py-2 text-xs font-semibold text-[#0e6a68] disabled:opacity-40">Open fixed timer</button><button onClick={() => control(round.id, "close")} disabled={busy === round.id + "close" || round.state !== "open"} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Close</button>{rankLimits.map((rankLimit) => <button key={rankLimit} onClick={() => control(round.id, "score-publish", rankLimit)} disabled={busy === round.id + "score-publish" || round.state === "draft"} className="rounded-lg bg-[#083f41] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">Score & publish Top {rankLimit}</button>)}</div></div>; })}</div>
              {roundDraft && <form onSubmit={saveRound} className="mt-5 rounded-2xl border border-[#cde1d9] bg-[#f4f8f6] p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#0e6a68]">Private answer authoring</p><h3 className="font-display text-xl font-bold text-slate-900">Configure this draft round</h3></div><button type="button" onClick={() => setRoundDraft(null)} className="text-sm font-semibold text-slate-500">Cancel</button></div><div className="grid gap-3 sm:grid-cols-2"><input required value={roundDraft.title} onChange={(event) => setRoundDraft({ ...roundDraft, title: event.target.value })} placeholder="Round title" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /><textarea required value={roundDraft.scenario} onChange={(event) => setRoundDraft({ ...roundDraft, scenario: event.target.value })} placeholder="Scenario shown to Captains" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0e6a68] sm:col-span-2" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{roundDraft.options.map((option, index) => <label key={option.id} className="flex items-center gap-2 text-sm font-semibold text-slate-600"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#0e6a68]">{option.id}</span><input required value={option.text} onChange={(event) => setRoundDraft({ ...roundDraft, options: roundDraft.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} placeholder={`Option ${option.id}`} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]" /></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((answerIndex) => <label key={answerIndex} className="text-xs font-semibold text-slate-600">Boardroom Choice #{answerIndex + 1}<select value={roundDraft.answers[answerIndex] ?? ""} onChange={(event) => setRoundDraft({ ...roundDraft, answers: roundDraft.answers.map((answer, index) => index === answerIndex ? event.target.value : answer) })} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68]">{roundDraft.options.map((option) => <option key={option.id} value={option.id}>{option.id}</option>)}</select></label>)}</div><p className="mt-3 text-xs text-slate-500">The answer key is sent only to an authenticated Master workspace and is rejected if duplicate.</p><button disabled={busy === "round-config"} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#083f41] px-4 text-sm font-semibold text-white disabled:bg-slate-300"><Check size={16} /> {busy === "round-config" ? "Saving…" : "Save private round content"}</button></form>}
            </section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf5ef] text-[#0e6a68]"><UsersRound size={18} /></span><div><p className="text-sm font-semibold text-[#0e6a68]">Two-person control</p><h2 className="font-display text-xl font-bold text-slate-900">Master accounts</h2></div></div><div className="space-y-2">{overview.masters.map((entry) => <div key={entry.email} className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="font-semibold text-slate-800">{entry.displayName}</p><p className="font-mono text-xs text-slate-500">{entry.email}</p></div>)}</div><form onSubmit={addMaster} className="mt-4 space-y-2"><input required value={master.displayName} onChange={(event) => setMaster({ ...master, displayName: event.target.value })} placeholder="Second Master name" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0e6a68]" /><input required type="email" value={master.email} onChange={(event) => setMaster({ ...master, email: event.target.value })} placeholder="second.master@company.com" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0e6a68]" /><button disabled={busy === "master"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#0e6a68] px-3 py-2.5 text-sm font-semibold text-[#0e6a68] hover:bg-[#eaf5ef]"><Mail size={15} /> Add Master</button></form></section>
            <section className="rounded-2xl bg-[#073f41] p-5 text-white shadow-sm"><LockKeyhole className="mb-4 text-[#e8c46b]" size={22} /><h2 className="font-display text-xl font-bold">Isolation rules</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-[#c6dbd7]"><li>Captain endpoints check the authenticated email and only permit that Captain’s team.</li><li>Submissions are never sent to the leaderboard or another team.</li><li>Only published rank, name and score leave the Master workspace.</li><li>Every Master action and Captain submission is recorded.</li></ul></section>
          </aside>
        </div>
      </section>
    </main>
  );
}
