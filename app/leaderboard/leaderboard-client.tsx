"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Crown, Gauge, Medal, Pause, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import type { getPublicDisplay } from "@/lib/event-store";
import { burst, grandFinale } from "@/lib/celebrate";
import { usePoll } from "@/lib/use-poll";
import { useServerClock } from "@/lib/use-server-clock";

export type PublicDisplay = Awaited<ReturnType<typeof getPublicDisplay>>;
type Team = { teamId: string; name: string; score: number; rank: number };

const POLL_MS = 2000;

/** Which reveal sequence is on screen and how far it has got. Celebrations fire when the step moves forward. */
function revealProgress(display: PublicDisplay) {
  switch (display.mode) {
    case "reveal": return { key: "reveal:" + display.title, step: display.step };
    case "qualifiers": return { key: "qualifiers:" + display.stage, step: display.step };
    case "awards": return { key: "awards", step: display.step };
    default: return { key: display.mode, step: 0 };
  }
}

function celebrate(display: PublicDisplay) {
  if (display.mode === "reveal") {
    if (display.step >= 3) grandFinale(); else if (display.step > 0) burst(display.step as 1 | 2);
  } else if (display.mode === "qualifiers") {
    burst(display.step >= display.total ? 3 : 1);
  } else if (display.mode === "awards") {
    if (display.step >= 3) grandFinale(); else burst(2);
  }
}

function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

export function LeaderboardClient({ initial }: { initial: PublicDisplay }) {
  const [display, setDisplay] = useState(initial);
  const { serverNowMs, sync } = useServerClock(initial.serverNow);
  // Starts at what the page loaded with, so refreshing the projector mid-reveal stays quiet.
  const shown = useRef(revealProgress(initial));

  useEffect(() => {
    const next = revealProgress(display);
    const previousStep = next.key === shown.current.key ? shown.current.step : 0;
    shown.current = next;
    if (next.step > previousStep) celebrate(display);
  }, [display]);

  usePoll(async () => {
    const response = await fetch("/api/display", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = await response.json() as PublicDisplay;
    sync(next.serverNow);
    setDisplay(next);
  }, POLL_MS);

  return (
    <main className="min-h-screen bg-[#06292c] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-10 lg:py-10">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/master" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8b85b] text-lg font-black text-[#073638]">B</span><span><strong className="block font-display text-base tracking-tight">BOARDROOM</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-[#9cc3bd]">PARTNER SUMMIT · DAY 2</span></span></Link>
          <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-[#c3dcd7]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#f4c866]" /> LIVE</span>
        </header>
        <div className="flex flex-1 flex-col">{renderMode(display, serverNowMs)}</div>
        <footer className="mt-8 flex items-center gap-2 border-t border-white/10 pt-5 text-sm text-[#a9cbc4]"><Gauge size={16} /> Speed doesn&apos;t count · Only officially published results appear here.</footer>
      </div>
    </main>
  );
}

function Heading({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return <div className="mb-8"><p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b8d8d1]">{icon} {eyebrow}</p><h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{title}<span className="text-[#e8b85b]">.</span></h1></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="grid flex-1 place-items-center rounded-3xl border border-dashed border-white/20 bg-white/[0.03] p-10 text-center"><div><p className="font-display text-3xl font-bold">{title}</p><p className="mt-2 text-lg text-[#c3dcd7]">{detail}</p></div></div>;
}

function TeamRow({ entry, highlight }: { entry: Team; highlight?: boolean }) {
  return <div className={"grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 py-5 " + (highlight ? "animate-in fade-in slide-in-from-bottom-2 duration-500" : "")}><span className={"font-display text-3xl font-bold " + (entry.rank <= 3 ? "text-[#edc76e]" : "text-slate-300")}>{String(entry.rank).padStart(2, "0")}</span><p className="truncate text-2xl font-semibold">{entry.name}</p><span className="font-mono text-2xl font-bold">{entry.score}</span></div>;
}

function renderMode(display: PublicDisplay, serverNowMs: number) {
  switch (display.mode) {
    case "standings":
      return <>
        <Heading eyebrow="Leadership scoreboard" title={display.label} icon={<Trophy size={16} />} />
        {display.entries.length ? <div className="grid gap-x-14 lg:grid-cols-2">{display.entries.map((entry) => <TeamRow key={entry.teamId} entry={entry} />)}</div> : <Empty title="No standings yet." detail="Scores appear after the Score Controller publishes a round." />}
      </>;

    case "question": {
      const remaining = display.state === "paused" ? display.pausedRemainingMs ?? 0 : display.state === "open" && display.closesAt ? Date.parse(display.closesAt) - serverNowMs : 0;
      const running = display.state === "open" || display.state === "paused";
      return <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div><p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b8d8d1]">The Board speaks{display.multiplier > 1 ? ` · ${display.multiplier}× points` : ""}</p><h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{display.title}</h1></div>
          <div className={"rounded-2xl px-6 py-3 text-right " + (display.state === "paused" ? "bg-amber-600" : running && remaining < 30_000 ? "bg-rose-700" : "bg-white/10")}>
            <p className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/70">{display.state === "paused" ? <><Pause size={12} /> Paused</> : running ? "Time remaining" : "Answers locked"}</p>
            <p className="font-mono text-5xl font-bold">{running ? formatSeconds(remaining) : "00:00"}</p>
          </div>
        </div>
        <p className="mb-8 max-w-5xl whitespace-pre-line text-2xl leading-relaxed text-[#e3efec]">{display.scenario}</p>
        <div className="grid gap-3 lg:grid-cols-2">{display.options.map((option) => <div key={option.id} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-lg leading-snug"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e8b85b] font-bold text-[#073638]">{option.id}</span>{option.text}</div>)}</div>
      </>;
    }

    case "reveal":
      return <>
        <div key={display.step} className="animate-in fade-in zoom-in-95 duration-500">
          <Heading eyebrow={`${display.title} · The Boardroom Choices`} title={display.step === 0 ? "What did the Boardroom choose?" : display.step === 3 ? "The Boardroom has spoken" : `Boardroom #${4 - display.step}`} icon={<Award size={16} />} />
        </div>
        <div className="grid flex-1 content-start gap-4">
          {[...display.revealed].reverse().map((choice) => (
            <div key={choice.rank} className={"animate-in fade-in zoom-in-95 slide-in-from-bottom-4 rounded-3xl border p-6 duration-700 " + (choice.rank === 1 ? "reveal-glow border-[#e8b85b] bg-[#e8b85b]/10" : "border-[#e8b85b]/40 bg-white/[0.05]")}>
              <div className="flex items-start gap-5">
                <span className={"grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e8b85b] font-display text-2xl font-black text-[#073638] " + (choice.rank === 1 ? "animate-in spin-in-12 zoom-in-50 duration-700" : "")}>{choice.rank === 1 ? <Crown size={28} /> : "#" + choice.rank}</span>
                <div><p className="text-2xl font-semibold leading-snug"><span className="mr-2 text-[#e8b85b]">{choice.optionId}.</span>{choice.text}</p>{choice.evidence && <p className="mt-3 text-lg leading-relaxed text-[#c3dcd7]">{choice.evidence}</p>}<p className="mt-3 font-mono text-sm text-[#9cc3bd]">{[40, 30, 20][choice.rank - 1]} points{choice.rank === 1 ? " · +10 if it was your first pick" : ""}</p></div>
              </div>
            </div>
          ))}
          {display.step === 0 && <p className="whitespace-pre-line text-2xl leading-relaxed text-[#e3efec]">{display.scenario}</p>}
        </div>
      </>;

    case "qualifiers":
      return <>
        <Heading eyebrow={display.stage === "top5" ? "Into the playoff" : "Into the finale"} title={display.label} icon={<Medal size={16} />} />
        {display.revealed.length ? <div className="grid content-start">{display.revealed.map((entry, index) => <TeamRow key={entry.teamId} entry={entry} highlight={index === display.revealed.length - 1} />)}</div> : <Empty title={`Who makes the ${display.stage === "top5" ? "Top 5" : "Top 2"}?`} detail="Revealing in reverse order…" />}
      </>;

    case "awards":
      return <>
        <Heading eyebrow="Boardroom Challenge 2026" title="And the winners are" icon={<Crown size={16} />} />
        <div className="grid flex-1 content-start gap-5 lg:grid-cols-3">
          <AwardCard icon={<UsersRound size={28} />} title="Audience Champion" team={display.audienceChampion} />
          <AwardCard icon={<Medal size={28} />} title="Runner-up" team={display.runnerUp} />
          <AwardCard icon={<Trophy size={28} />} title="Winner" team={display.winner} gold />
        </div>
      </>;

    default:
      return <Empty title="Welcome to the Boardroom." detail="Find your table. The first scenario appears here shortly." />;
  }
}

function AwardCard({ icon, title, team, gold }: { icon: React.ReactNode; title: string; team: Team | null | undefined; gold?: boolean }) {
  return (
    <div className={"flex min-h-64 flex-col justify-between rounded-3xl border p-7 " + (gold ? "border-[#e8b85b] bg-[#e8b85b]/10" : "border-white/15 bg-white/[0.04]") + (gold && team ? " reveal-glow" : "")}>
      <div className={"flex items-center gap-3 text-lg font-semibold uppercase tracking-[0.12em] " + (gold ? "text-[#e8b85b]" : "text-[#b8d8d1]")}>{icon} {title}</div>
      {team === undefined ? <p className="font-display text-5xl font-bold text-white/20">?</p> : team === null ? <p className="text-xl text-[#c3dcd7]">Not awarded</p> : <div className="animate-in fade-in zoom-in-95 duration-700"><p className="font-display text-4xl font-bold leading-tight">{team.name}</p><p className="mt-2 font-mono text-lg text-[#c3dcd7]">{team.score} pts</p></div>}
    </div>
  );
}
