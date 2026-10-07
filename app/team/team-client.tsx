"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock3, ShieldCheck, UsersRound } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";

type Round = { id: string; title: string; phase: string; scenario: string; options: { id: string; text: string }[]; closesAt: string | null } | null;

function remaining(closesAt: string | null) {
  if (!closesAt) return "00:00";
  const seconds = Math.max(0, Math.ceil((Date.parse(closesAt) - Date.now()) / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

export function TeamClient({ team, round }: { team: { name: string; tableNumber: string }; round: Round }) {
  const [picks, setPicks] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(remaining(round?.closesAt ?? null));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(remaining(round?.closesAt ?? null)), 1000);
    return () => window.clearInterval(timer);
  }, [round?.closesAt]);

  function choose(choice: string) {
    setStatus("idle");
    setPicks((current) => current.includes(choice) ? current.filter((item) => item !== choice) : current.length === 3 ? current : [...current, choice]);
  }

  async function submit() {
    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/team/submission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choices: picks }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setStatus("error");
      setMessage(payload.error ?? "Submission could not be saved.");
      return;
    }
    setStatus("saved");
    setMessage("Your ranked answer is saved. You may update it until the round closes.");
  }

  return (
    <main className="min-h-screen bg-[#eff4f2]">
      <BoardroomNav active="team" />
      <section className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-semibold text-[#0e6a68]">{team.name} · {team.tableNumber}</p><h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c]">{round ? round.title : "Waiting for the next round"}</h1></div>{round && <div className="rounded-2xl bg-[#083f41] px-5 py-3 text-right text-white"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#a8dcce]">Server time remaining</p><p className="font-mono text-2xl font-bold">{clock}</p></div>}</div>
        {!round ? <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><Clock3 className="mb-5 text-[#0e6a68]" size={28} /><h2 className="font-display text-2xl font-bold text-slate-900">The Master has not opened a round yet.</h2><p className="mt-3 text-slate-600">Keep this screen open. Your team’s private question will appear here when the fixed round window starts.</p></div> : (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {round.phase !== "prelim" && <div className="mb-5 flex gap-3 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm leading-6 text-[#275c58]"><UsersRound className="mt-0.5 shrink-0" size={19} /><p><strong>Everyone can keep playing.</strong> Official scoring is limited to the teams selected for this stage.</p></div>}
            <div className="max-w-3xl border-b border-slate-200 pb-6"><p className="text-sm font-semibold text-[#0e6a68]">Decision brief</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{round.scenario}</h2><p className="mt-3 text-base leading-7 text-slate-600">Choose the three strongest actions in ranked order. No other team’s choices, score, or status is available here.</p></div>
            <div className="my-6 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold text-slate-700">Your ranking</span>{[0, 1, 2].map((index) => <span key={index} className={"inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-bold " + (picks[index] ? "border-[#0e6a68] bg-[#e3f2ee] text-[#075c58]" : "border-slate-200 bg-slate-50 text-slate-400")}><small>#{index + 1}</small>{picks[index] || "—"}</span>)}<button onClick={() => { setPicks([]); setStatus("idle"); }} className="ml-1 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</button></div>
            <div className="grid gap-3 sm:grid-cols-2">{round.options.map((option) => { const place = picks.indexOf(option.id); return <button key={option.id} onClick={() => choose(option.id)} className={"flex min-h-[92px] items-start gap-4 rounded-2xl border p-4 text-left transition " + (place >= 0 ? "border-[#0e6a68] bg-[#e5f3ef] shadow-sm" : "border-slate-200 hover:border-[#74a6a2] hover:bg-[#f7fbf9]")}><span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold " + (place >= 0 ? "bg-[#0d5c5c] text-white" : "bg-slate-100 text-slate-600")}>{place >= 0 ? "#" + (place + 1) : option.id}</span><span className="pr-1 text-sm leading-6 text-slate-700">{option.text}</span></button>; })}</div>
            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center"><p className={"text-sm " + (status === "error" ? "text-rose-700" : "text-slate-500")}>{message || "One answer per team. You may update it until the server closes the round."}</p><button disabled={picks.length !== 3 || status === "saving"} onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5c5c] disabled:cursor-not-allowed disabled:bg-slate-300">{status === "saved" ? <><Check size={17} /> Answer saved</> : <>Save ranked answer <ChevronRight size={17} /></>}</button></div>
            <div className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 shrink-0 text-[#0e6a68]" size={15} />The server validates your Captain identity, team membership, round state, deadline and options on every request.</div>
          </section>
        )}
      </section>
    </main>
  );
}
