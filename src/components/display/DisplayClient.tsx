"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Award, CheckCircle2, Circle, Crown, Gauge, Gift, HardHat, Lightbulb, Link2Off, Medal, Pause, Siren, Trophy, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Mascot } from "@/components/ui/Mascot";
import { EVENT } from "@/data/brand";
import { requestJson } from "@/lib/api";
import { soundboard, type OneShotCue } from "@/lib/audio/soundboard";
import { burst, grandFinale } from "@/lib/celebrate";
import { formatSeconds } from "@/lib/format";
import type { getPublicDisplay } from "@/lib/game/eventStore";
import { debateSegment, SEGMENTS } from "@/lib/game/segments";
import { usePoll } from "@/lib/hooks/usePoll";
import { useServerClock } from "@/lib/hooks/useServerClock";
import { cn } from "@/lib/utils";
import type { PublicTeam } from "@/types";
import { countdown, useDisplayAudio, useSoundState } from "./useDisplayAudio";

export type PublicDisplay = Awaited<ReturnType<typeof getPublicDisplay>>;

const POLL_MS = 2000;
/** How long a reveal is held behind the drumroll before it lands. Matches the synth drumroll. */
const DRUMROLL_MS = 2000;

type Suspense = { key: string; label: string; land: OneShotCue };

/** A reveal step that is held for a drumroll, what the screen says while it rolls, and the sting it lands on. */
function suspenseOf(display: PublicDisplay): Suspense | null {
  switch (display.mode) {
    case "reveal":
      if (display.step < 1 || display.step > 3) return null;
      return { key: `reveal:${display.title}:${display.step}`, label: `Boardroom #${4 - display.step} is…`, land: (["sting-3", "sting-2", "sting-1"] as const)[display.step - 1] };
    case "qualifiers":
      if (display.step < 1) return null;
      return display.step >= display.total
        ? { key: `qualifiers:${display.stage}:${display.step}`, label: "And the top qualifier is…", land: "sting-1" }
        : { key: `qualifiers:${display.stage}:${display.step}`, label: "Into the finale…", land: "sting-2" };
    case "awards":
      if (display.step < 1) return null;
      return {
        key: `awards:${display.step}`,
        label: ["The chocolate hamper goes to…", "Your runner-up is…", "The Boardroom Champions are…"][display.step - 1] ?? "",
        land: display.step >= 3 ? "champion" : "sting-2",
      };
    case "sudden-death":
      if (display.step < 1) return null;
      return display.step === 1
        ? { key: `sudden:${display.id}:1`, label: "The right answer is…", land: "hit" }
        : { key: `sudden:${display.id}:2`, label: "Who got it right…", land: "sting-1" };
    default:
      return null;
  }
}

function celebrate(display: PublicDisplay) {
  if (display.mode === "reveal") {
    if (display.step >= 3) grandFinale(); else burst(display.step as 1 | 2);
  } else if (display.mode === "qualifiers") {
    burst(display.step >= display.total ? 3 : 1);
  } else if (display.mode === "awards") {
    if (display.step >= 3) grandFinale(); else burst(2);
  } else if (display.mode === "sudden-death" && display.step >= 2) {
    grandFinale();
  }
}

/**
 * The projector. Keeps its last good frame through network or server hiccups instead of flashing another slide.
 * Each new reveal step is held for a two-second drumroll, then the card, the sting and the confetti land together.
 */
export function DisplayClient({ initial }: { initial: PublicDisplay }) {
  const [shown, setShown] = useState(initial);
  const [rolling, setRolling] = useState<string | null>(null);
  const [problem, setProblem] = useState<"offline" | "revoked" | null>(null);
  const counting = (shown.mode === "question" && (shown.state === "open" || shown.state === "paused")) || (shown.mode === "sudden-death" && shown.state === "open");
  const { serverNowMs, sync } = useServerClock(initial.serverNow, counting);
  // Each reveal step rolls once, even if the Master steps away and back. Starts with whatever was on screen at load.
  const celebrated = useRef(new Set([suspenseOf(initial)?.key].filter(Boolean) as string[]));
  const pending = useRef<{ key: string; display: PublicDisplay; timer: number } | null>(null);

  const receive = useCallback((next: PublicDisplay) => {
    const suspense = suspenseOf(next);
    const held = pending.current;
    if (suspense && !celebrated.current.has(suspense.key)) {
      celebrated.current.add(suspense.key);
      if (held) window.clearTimeout(held.timer);
      soundboard.stop("drumroll");
      soundboard.play("drumroll");
      const timer = window.setTimeout(() => {
        const landing = pending.current?.display ?? next;
        pending.current = null;
        setRolling(null);
        setShown(landing);
        soundboard.play(suspense.land);
        celebrate(landing);
      }, DRUMROLL_MS);
      pending.current = { key: suspense.key, display: next, timer };
      setRolling(suspense.label);
      return;
    }
    if (held) {
      // The same step, freshly polled: keep rolling and land on the newest data.
      if (suspense?.key === held.key) { held.display = next; return; }
      // The Master moved the screen on mid-roll: drop the roll and show what is there now.
      window.clearTimeout(held.timer);
      pending.current = null;
      soundboard.stop("drumroll");
      setRolling(null);
    }
    setShown(next);
  }, []);

  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current.timer); }, []);

  usePoll(async (signal) => {
    const sentAt = Date.now();
    const result = await requestJson<PublicDisplay>("/api/display", { signal });
    if (!result.ok) { setProblem(result.status === 401 ? "revoked" : "offline"); return; }
    setProblem(null);
    sync(result.data.serverNow, sentAt, Date.now());
    receive(result.data);
  }, POLL_MS);

  useDisplayAudio(shown, serverNowMs, initial);

  return (
    <main className="relative flex min-h-screen flex-col bg-surface text-ink">
      <header className="bg-teal-dark text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-5">
            <Logo className="h-9" />
            <span className="h-9 w-px bg-rule-light" aria-hidden />
            <span><strong className="block font-display text-lg">{EVENT.name}</strong><span className="kicker block text-cyan-soft">{EVENT.occasion}</span></span>
          </div>
          <div className="flex items-center gap-3">
            <SoundControl />
            <StatusPill problem={problem} />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8 lg:px-10 lg:py-10">{renderMode(shown, serverNowMs)}</div>
      <footer className="border-t border-rule">
        <p className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-4 text-sm text-muted lg:px-10"><Gauge size={16} /> Speed doesn&apos;t count · Only officially published results appear here.</p>
      </footer>
      {rolling && <Drumroll label={rolling} />}
    </main>
  );
}

/** The held moment before a reveal: the label throbs in time with the roll and a bar fills to the hit. */
function Drumroll({ label }: { label: string }) {
  return (
    <div className="animate-in fade-in absolute inset-0 z-40 flex items-center justify-center bg-teal-dark/90 duration-200" role="status" aria-live="polite">
      <div className="w-full max-w-4xl px-10 text-center">
        <p className="kicker mb-6 text-cyan-soft">Drumroll, please</p>
        <p className="drumroll-throb font-display text-display text-cream">{label}</p>
        <div className="mx-auto mt-10 h-2 w-full max-w-xl overflow-hidden rounded-full bg-cream/15"><div key={label} className="drumroll-fill h-full w-full rounded-full bg-accent" /></div>
      </div>
    </div>
  );
}

/** "Enable sound" until the operator clicks once (browsers block autoplay), then a mute toggle. M also toggles. */
function SoundControl() {
  const { unlocked, muted } = useSoundState();

  useEffect(() => {
    const unlock = () => { void soundboard.unlock(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "m" && !event.metaKey && !event.ctrlKey) soundboard.setMuted(!soundboard.getSnapshot().muted);
      unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", onKey); };
  }, []);

  if (!unlocked) {
    return <button type="button" onClick={() => void soundboard.unlock()} className="flex animate-pulse items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"><Volume2 size={15} /> Click to enable sound</button>;
  }
  return (
    <button type="button" onClick={() => soundboard.setMuted(!muted)} title="Mute or unmute this screen (M)" className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold", muted ? "border-warning bg-warning text-white" : "border-rule-light text-cream")}>
      {muted ? <><VolumeX size={15} /> Muted</> : <Volume2 size={15} />}
    </button>
  );
}

function StatusPill({ problem }: { problem: "offline" | "revoked" | null }) {
  if (problem === "revoked") return <span className="flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-sm font-semibold text-white"><Link2Off size={15} /> Projector link revoked</span>;
  if (problem === "offline") return <span className="flex items-center gap-2 rounded-full bg-warning px-3 py-1.5 text-sm font-semibold text-white"><WifiOff size={15} /> Reconnecting…</span>;
  return <span className="flex items-center gap-2 rounded-full border border-rule-light px-3 py-1.5 text-sm font-semibold text-cream"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> LIVE</span>;
}

function Heading({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="kicker mb-3 flex items-center gap-2 text-teal-mid">{icon} {eyebrow}</p>
      <h1 className="font-display text-display text-ink">{title}<span className="text-accent">.</span></h1>
    </div>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="card-xl flex flex-1 flex-col items-center justify-center gap-6 border border-dashed border-rule-strong bg-white p-10 text-center lg:flex-row lg:text-left">
      <Mascot className="h-48 lg:h-64" />
      <div><p className="font-display text-h1 text-ink">{title}</p><p className="mt-3 text-lead text-muted">{detail}</p></div>
    </div>
  );
}

function TeamRow({ entry, highlight }: { entry: PublicTeam; highlight?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule py-5", highlight && "animate-in fade-in slide-in-from-bottom-2 duration-500")}>
      <span className={cn("font-display text-4xl font-bold tabular-nums", entry.rank <= 3 ? "text-accent" : "text-faint")}>{String(entry.rank).padStart(2, "0")}</span>
      <p className="truncate text-3xl font-semibold text-ink">{entry.name}</p>
      <span className="font-mono text-3xl font-bold tabular-nums text-teal-base">{entry.score}</span>
    </div>
  );
}

/** The deck's five-minute debate, with the running segment lit. */
function SegmentStrip({ remaining, live }: { remaining: number; live: boolean }) {
  const active = live ? debateSegment(remaining).key : null;
  const activeIndex = SEGMENTS.findIndex((segment) => segment.key === active);
  return (
    <div className="mb-6 grid grid-cols-5 gap-2">
      {SEGMENTS.map((segment, index) => {
        const isActive = index === activeIndex;
        const done = live && index < activeIndex;
        return (
          <div key={segment.key} className={cn("tile border px-4 py-3 transition-colors duration-500", isActive ? (segment.key === "lock" ? "border-danger bg-danger text-white" : "border-accent bg-panel-orange") : done ? "border-rule bg-surface-sunk" : "border-rule bg-white")}>
            <p className={cn("kicker flex items-center gap-1.5", isActive ? (segment.key === "lock" ? "text-white" : "text-accent-deep") : done ? "text-faint" : "text-teal-mid")}>
              {done ? <CheckCircle2 size={12} /> : isActive ? <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> : <Circle size={12} />} {segment.label}
            </p>
            <p className={cn("mt-1 text-sm leading-snug", isActive ? (segment.key === "lock" ? "text-white" : "text-ink") : "text-muted")}>{segment.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function renderMode(display: PublicDisplay, serverNowMs: number) {
  switch (display.mode) {
    case "standings":
      return <>
        <Heading eyebrow="Leadership scoreboard" title={display.label} icon={<Trophy size={16} />} />
        {display.entries.length ? <div className="grid gap-x-14 lg:grid-cols-2">{display.entries.map((entry) => <TeamRow key={entry.teamId} entry={entry} />)}</div> : <Empty title="No standings yet." detail="Scores appear after a Master publishes a round." />}
      </>;

    case "question": {
      const { remaining, running, paused } = countdown(display, serverNowMs);
      const live = running || paused;
      const practice = display.phase === "trial";
      // The two-minute practice round has no debate segments; its last 30 seconds are the lock window.
      const lockWindow = running && (practice ? remaining <= 30_000 : debateSegment(remaining).key === "lock");
      return <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="kicker mb-3 flex flex-wrap items-center gap-3 text-accent">{practice ? <span className="rounded-full bg-accent px-3 py-1 text-white">Practice round · doesn&apos;t count</span> : "The Board says"}{display.leadHat && <span className="flex items-center gap-1.5 rounded-full bg-panel-teal px-3 py-1 text-teal-base"><HardHat size={13} /> Lead hat: {display.leadHat}</span>}</p>
            <h1 className="font-display text-h1 text-ink">{display.title}</h1>
          </div>
          <div className={cn("tile px-6 py-3 text-right text-white", paused ? "bg-warning" : lockWindow ? "bg-danger" : "bg-teal-dark", lockWindow && remaining <= 10_000 && "drumroll-throb")}>
            <p className="kicker flex items-center justify-end gap-1 text-white/75">{paused ? <><Pause size={12} /> Paused</> : running ? (lockWindow ? "Lock it in" : "Time remaining") : "Answers locked"}</p>
            <p className="font-mono text-6xl font-bold tabular-nums">{live ? formatSeconds(remaining) : "00:00"}</p>
          </div>
        </div>
        {live && !practice && <SegmentStrip remaining={remaining} live={live} />}
        <p className="max-w-5xl whitespace-pre-line text-2xl font-semibold leading-relaxed text-ink">{display.scenario}</p>
        {display.context && <p className="mb-8 mt-3 max-w-5xl text-xl italic leading-relaxed text-muted">{display.context}</p>}
        <div className={cn("grid gap-3 lg:grid-cols-2", !display.context && "mt-8")}>
          {display.options.map((option) => <div key={option.id} className="tile flex gap-4 border border-rule bg-white p-5 text-xl leading-snug text-ink"><span className="chip grid h-10 w-10 shrink-0 place-items-center bg-teal-dark font-display text-lg font-bold text-cream">{option.id}</span>{option.text}</div>)}
        </div>
      </>;
    }

    case "reveal": {
      const done = display.step >= 4;
      return <>
        <div key={display.step} className="animate-in fade-in zoom-in-95 duration-500">
          <Heading eyebrow={`${display.title} · The Boardroom Choices`} title={display.step === 0 ? "What did the Boardroom choose?" : display.step >= 3 ? "The Boardroom has spoken" : `Boardroom #${4 - display.step}`} icon={<Award size={16} />} />
        </div>
        {done && display.principle && (
          <div className="card-xl animate-in fade-in slide-in-from-top-4 mb-5 flex items-start gap-5 bg-teal-dark p-6 text-cream duration-700">
            <span className="tile grid h-14 w-14 shrink-0 place-items-center bg-accent text-white"><Lightbulb size={26} /></span>
            <div>
              <p className="kicker text-cyan-soft">The principle</p>
              <p className="mt-1 font-display text-h2">{display.principle}</p>
            </div>
          </div>
        )}
        <div className="grid flex-1 content-start gap-4">
          {[...display.revealed].reverse().map((choice) => (
            <div key={choice.rank} className={cn("card-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 border duration-700", done ? "p-4" : "p-6", choice.rank === 1 ? "reveal-glow border-accent bg-panel-orange" : "border-rule bg-white")}>
              <div className="flex items-start gap-5">
                <span className={cn("tile grid h-16 w-16 shrink-0 place-items-center bg-accent font-display text-2xl font-bold text-white", choice.rank === 1 && "animate-in spin-in-12 zoom-in-50 duration-700")}>{choice.rank === 1 ? <Crown size={28} /> : "#" + choice.rank}</span>
                <div>
                  <p className="text-2xl font-semibold leading-snug text-ink"><span className="mr-2 text-accent-deep">{choice.optionId}.</span>{choice.text}</p>
                  {choice.evidence && !done && <p className="mt-3 text-lg leading-relaxed text-muted">{choice.evidence}</p>}
                  <p className="mt-3 font-mono text-sm text-teal-mid">{display.phase === "trial" ? `Practice · would be ${[40, 30, 20][choice.rank - 1]} points` : `${[40, 30, 20][choice.rank - 1]} points${choice.rank === 1 ? " · +10 if it was your first pick" : ""}`}</p>
                </div>
              </div>
            </div>
          ))}
          {done && display.othersNote && (
            <div className="tile animate-in fade-in border border-rule bg-white p-5 duration-700">
              <p className="kicker text-teal-mid">Why the other options rank lower</p>
              <p className="mt-2 text-lg leading-relaxed text-ink">{display.othersNote}</p>
            </div>
          )}
          {display.step === 0 && <>
            <p className="whitespace-pre-line text-2xl font-semibold leading-relaxed text-ink">{display.scenario}</p>
            {display.context && <p className="text-xl italic leading-relaxed text-muted">{display.context}</p>}
          </>}
        </div>
      </>;
    }

    case "qualifiers":
      return <>
        <Heading eyebrow="Into the finale" title={display.label} icon={<Medal size={16} />} />
        {display.revealed.length ? <div className="grid content-start">{display.revealed.map((entry, index) => <TeamRow key={entry.teamId} entry={entry} highlight={index === display.revealed.length - 1} />)}</div> : <Empty title="Who makes the Top 2?" detail="Two teams go on stage for Rounds 5 and 6. Revealing in reverse order…" />}
      </>;

    case "awards":
      return <>
        <Heading eyebrow={EVENT.edition} title="And the winners are" icon={<Crown size={16} />} />
        <div className="grid flex-1 content-start gap-5 lg:grid-cols-3">
          <AwardCard icon={<Gift size={28} />} title="Chocolate hamper" prize="Highest six-round score outside the Top 2" team={display.audienceChampion} />
          <AwardCard icon={<Medal size={28} />} title="Runner-up" prize="₹11,000" team={display.runnerUp} />
          <AwardCard icon={<Trophy size={28} />} title="Winner" prize="₹21,000" team={display.winner} gold />
        </div>
        {display.winner && <Mascot className="mx-auto mt-8 h-40 animate-in fade-in zoom-in-95 duration-700" />}
      </>;

    case "sudden-death": {
      const { remaining, running } = countdown(display, serverNowMs);
      const picksOf = (letter: string) => display.picks?.filter((pick) => pick.choice === letter) ?? [];
      return <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="kicker mb-3 flex items-center gap-2 text-danger"><Siren size={16} /> Sudden death · {display.questionKey}</p>
            <h1 className="font-display text-h1 text-ink">Only the right answer counts<span className="text-accent">.</span></h1>
          </div>
          <div className={cn("tile px-6 py-3 text-right text-white", running && remaining <= 10_000 ? "drumroll-throb bg-danger" : running ? "bg-teal-dark" : "bg-ink")}>
            <p className="kicker text-white/75">{running ? "Time remaining" : "Answers locked"}</p>
            <p className="font-mono text-6xl font-bold tabular-nums">{running ? formatSeconds(remaining) : "00:00"}</p>
          </div>
        </div>
        <p className="mb-6 max-w-5xl text-h2 font-semibold leading-snug text-ink">{display.question}</p>
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {display.options.map((option) => {
            const correct = display.correct === option.id;
            const wrong = display.correct !== null && !correct;
            return (
              <div key={option.id} className={cn("tile flex items-center gap-4 border p-5 text-2xl leading-snug transition-all duration-700", correct ? "reveal-glow border-accent bg-panel-orange text-ink" : wrong ? "border-rule bg-surface-sunk text-faint" : "border-rule bg-white text-ink")}>
                <span className={cn("chip grid h-12 w-12 shrink-0 place-items-center font-display text-xl font-bold", correct ? "bg-accent text-white" : wrong ? "bg-rule text-muted" : "bg-teal-dark text-cream")}>{correct ? <CheckCircle2 size={24} /> : option.id}</span>
                <span className="min-w-0 flex-1 font-semibold">{option.text}</span>
                {display.picks && <span className="flex flex-wrap justify-end gap-1.5">{picksOf(option.id).map((pick) => <span key={pick.teamId} className={cn("rounded-full px-3 py-1 text-sm font-bold", pick.correct ? "bg-accent text-white" : "bg-rule-strong text-white")}>{pick.name}</span>)}</span>}
              </div>
            );
          })}
        </div>
        <div className="grid content-start gap-3 lg:grid-cols-2">
          {display.picks
            ? display.picks.map((pick) => (
              <div key={pick.teamId} className={cn("tile animate-in fade-in slide-in-from-bottom-2 flex items-center gap-4 border p-4 duration-500", pick.winner ? "reveal-glow border-accent bg-panel-orange" : "border-rule bg-white")}>
                <span className={cn("font-display text-2xl font-bold", pick.winner ? "text-accent" : "text-faint")}>{pick.winner ? <Crown size={26} /> : pick.correct ? <CheckCircle2 size={26} /> : "✗"}</span>
                <p className="min-w-0 flex-1 truncate text-2xl font-semibold text-ink">{pick.name}</p>
                <span className="font-mono text-xl font-bold text-teal-base">{pick.choice ?? "no answer"}</span>
              </div>
            ))
            : display.teams.map((team) => (
              <div key={team.teamId} className={cn("tile flex items-center gap-4 border p-4", team.answered ? "border-success/40 bg-panel-success" : "border-rule bg-white")}>
                {team.answered ? <CheckCircle2 size={24} className="text-success" /> : <Circle size={24} className="animate-pulse text-faint" />}
                <p className="min-w-0 flex-1 truncate text-2xl font-semibold text-ink">{team.name}</p>
                <span className="kicker text-muted">{team.answered ? "Locked in" : "Thinking…"}</span>
              </div>
            ))}
        </div>
      </>;
    }

    default:
      return <Empty title="Welcome to the Boardroom." detail="Find your table. The first scenario appears here shortly." />;
  }
}

function AwardCard({ icon, title, prize, team, gold }: { icon: React.ReactNode; title: string; prize: string; team: PublicTeam | null | undefined; gold?: boolean }) {
  return (
    <div className={cn("card-xl flex min-h-64 flex-col justify-between border p-7", gold ? "border-accent bg-panel-orange" : "border-rule bg-white", gold && team && "reveal-glow")}>
      <div>
        <div className={cn("kicker flex items-center gap-3 text-base", gold ? "text-accent-deep" : "text-teal-mid")}>{icon} {title}</div>
        <p className="mt-2 text-sm font-semibold text-muted">{prize}</p>
      </div>
      {team === undefined
        ? <p className="font-display text-display text-rule-strong">?</p>
        : team === null
          ? <p className="text-xl text-muted">Not awarded</p>
          : <div className="animate-in fade-in zoom-in-95 duration-700"><p className="font-display text-h1 text-ink">{team.name}</p><p className="mt-2 font-mono text-lg text-muted">{team.score} pts</p></div>}
    </div>
  );
}

/** Shown when this browser has no projector link and no Master session. Never a sign-in form, so nothing private appears on a big screen. */
export function DisplayLocked({ invalidLink }: { invalidLink: boolean }) {
  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="bg-teal-dark"><div className="mx-auto max-w-7xl px-6 py-4 lg:px-10"><Logo className="h-9" /></div></header>
      <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <Mascot className="h-48" />
        <p className="kicker text-accent">{EVENT.name} · Projector</p>
        <h1 className="font-display text-h1 text-ink">{invalidLink ? "This projector link has expired or was revoked." : "This screen isn't connected yet."}</h1>
        <p className="text-lead text-muted">A Master can create a projector link in <strong className="text-ink">Event control → Screen control</strong> and open it on this computer.</p>
      </div>
    </main>
  );
}
