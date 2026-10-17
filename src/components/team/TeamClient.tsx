"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Award, Check, ChevronRight, Crown, Gift, GripVertical, HardHat, LogOut, Pause, Siren, WifiOff, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { Notice } from "@/components/ui/Notice";
import { postJson, requestJson } from "@/lib/api";
import { burst, grandFinale } from "@/lib/celebrate";
import { formatSeconds } from "@/lib/format";
import { debateSegment } from "@/lib/game/segments";
import type { getTeamState } from "@/lib/game/eventStore";
import { POINTS_BY_BOARDROOM_RANK } from "@/lib/game/scoring";
import { usePoll } from "@/lib/hooks/usePoll";
import { useHydrated, useServerClock } from "@/lib/hooks/useServerClock";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";

type TeamState = Awaited<ReturnType<typeof getTeamState>>;
type Slots = (string | null)[];
type Reveal = NonNullable<TeamState["reveal"]>;
type SuddenDeath = NonNullable<TeamState["suddenDeath"]>;

const POLL_MS = 2000;
const SLOT_PREFIX = "slot-";

const toSlots = (choices: string[] | undefined): Slots => [0, 1, 2].map((index) => choices?.[index] ?? null);
const revealKey = (reveal: TeamState["reveal"]) => (reveal ? `${reveal.roundId}:${reveal.step}` : null);

export function TeamClient({ initial }: { initial: TeamState }) {
  const [state, setState] = useState(initial);
  // The clock only ticks while something is counting down, so an idle phone isn't re-rendering four times a second.
  const counting = state.round?.state === "open" || state.round?.state === "paused" || state.suddenDeath?.state === "open";
  const { serverNowMs, sync } = useServerClock(initial.serverNow, counting);
  const hydrated = useHydrated();
  const [slots, setSlots] = useState<Slots>(toSlots(initial.submission?.choices));
  const [roundId, setRoundId] = useState(initial.round?.id ?? null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  // Consecutive failed polls: two in a row (about 4 s) shows the reconnecting banner, whatever the cause.
  const [failures, setFailures] = useState(0);
  // Bumped by every save, so a poll that started before the save can't put the old answer back on screen.
  const mutation = useRef(0);
  // Reveal steps already celebrated on this phone. Lives here, not in the reveal panel, so a remount stays quiet.
  const celebrated = useRef(new Set([revealKey(initial.reveal)].filter(Boolean) as string[]));
  /** True the first time a reveal step is seen on this phone. */
  const firstSight = useCallback((key: string) => {
    if (celebrated.current.has(key)) return false;
    celebrated.current.add(key);
    return true;
  }, []);
  // Mouse drags start after a small move; touch drags need a short press so the page still scrolls.
  // Keyboard users get the tap behaviour (Enter/Space on an option) instead of a keyboard drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  // The latest picks, for the poll callback below (which outlives a render).
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  usePoll(async (signal) => {
    const seq = mutation.current;
    const sentAt = Date.now();
    const result = await requestJson<TeamState>("/api/team/state", { signal });
    if (!result.ok) {
      if (result.status === 401) { window.location.reload(); return; }
      setOffline(result.status === 0);
      setFailures((count) => count + 1);
      return;
    }
    setOffline(false);
    setFailures(0);
    sync(result.data.serverNow, sentAt, Date.now());
    if (seq !== mutation.current) return;
    setState(result.data);
    // A save that timed out on this phone but did land on the server: the poll shows it, so drop the stale error.
    const savedChoices = result.data.submission?.choices.join();
    setError((current) => (current && savedChoices && savedChoices === slotsRef.current.filter(Boolean).join() ? "" : current));
  }, POLL_MS);

  // A new round starts with that round's saved answer (or a blank slate).
  if ((state.round?.id ?? null) !== roundId) {
    setRoundId(state.round?.id ?? null);
    setSlots(toSlots(state.submission?.choices));
    setError("");
  }

  const round = state.round;
  // A tied team in a sudden death sees only that: the closed round underneath would just distract.
  const inSuddenDeath = Boolean(state.suddenDeath?.playing) && !(round && (round.state === "open" || round.state === "paused"));
  const running = round?.state === "open" && round.closesAt ? Date.parse(round.closesAt) - serverNowMs : 0;
  const isOpen = round?.state === "open" && running > 0;
  const remainingMs = round?.state === "paused" ? round.pausedRemainingMs ?? 0 : Math.max(0, running);
  const saved = state.submission;
  const picks = slots.filter((slot): slot is string => slot !== null);
  const sameAsSaved = Boolean(saved) && picks.join() === saved?.choices.join();
  const optionById = (optionId: string | null) => round?.options.find((option) => option.id === optionId);

  /** Puts an option into a slot, moving it out of any slot it was already in. */
  function place(optionId: string, slotIndex: number) {
    if (!isOpen) return;
    setError("");
    setSlots((current) => current.map((slot, index) => (index === slotIndex ? optionId : slot === optionId ? null : slot)));
  }

  /** Tap fallback: an unplaced option fills the next empty slot; a placed one is removed. */
  function tap(optionId: string) {
    if (!isOpen) return;
    setError("");
    setSlots((current) => {
      if (current.includes(optionId)) return current.map((slot) => (slot === optionId ? null : slot));
      const empty = current.indexOf(null);
      return empty < 0 ? current : current.map((slot, index) => (index === empty ? optionId : slot));
    });
  }

  function clearSlot(slotIndex: number) {
    setSlots((current) => current.map((slot, index) => (index === slotIndex ? null : slot)));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const target = String(over?.id ?? "");
    if (target.startsWith(SLOT_PREFIX)) place(String(active.id), Number(target.slice(SLOT_PREFIX.length)));
  }

  async function submit() {
    if (!round) return;
    const submittedRoundId = round.id;
    const choices = picks;
    mutation.current += 1;
    setSaving(true);
    setError("");
    try {
      const result = await postJson<{ result: { roundId: string; updatedAt: string } }>("/api/team/submission", { roundId: submittedRoundId, choices });
      if (!result.ok) { setError(result.error); return; }
      const saved = result.data.result;
      setState((current) => current.round?.id === saved.roundId ? { ...current, submission: { choices, updatedAt: saved.updatedAt } } : current);
    } finally {
      mutation.current += 1;
      setSaving(false);
    }
  }

  /** Keeps a just-saved sudden-death number on screen until the next poll confirms it. */
  const savedSuddenDeath = useCallback((suddenDeathId: string, choice: string) => {
    mutation.current += 1;
    setState((current) => current.suddenDeath?.id === suddenDeathId ? { ...current, suddenDeath: { ...current.suddenDeath, myChoice: choice } } : current);
  }, []);

  async function signOut() {
    await postJson("/api/captain/signout");
    window.location.reload();
  }

  const draggedOption = optionById(dragging);

  let status: string;
  if (error) status = error;
  else if (isOpen && picks.length < 3) status = `Fill all three slots (${picks.length}/3).${saved ? " Your saved answer still counts until you lock in a new one." : ""}`;
  else if (isOpen && saved && sameAsSaved) status = `Saved ✓ ${saved.choices.map((choice, index) => `#${index + 1} ${choice}`).join(" · ")} at ${hydrated ? new Date(saved.updatedAt).toLocaleTimeString() : "…"}`;
  else if (isOpen && saved) status = "You have unsaved changes. Lock them in before time runs out.";
  else if (isOpen) status = "Ready to lock in. You can change it until time runs out.";
  else if (saved) status = `Your answer: ${saved.choices.map((choice, index) => `#${index + 1} ${choice}`).join(" · ")}`;
  else status = "No answer was saved for this round.";

  return (
    <main className="min-h-screen bg-surface">
      <Navbar active="team" />
      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        {(offline || failures >= 2) && <Notice tone="warning" className="mb-4 flex items-center gap-2" role="status"><WifiOff size={16} /> {offline ? "Reconnecting…" : "Having trouble reaching the server…"} Your saved answer is safe, and this screen updates as soon as the connection is back.</Notice>}

        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="kicker flex flex-wrap items-center gap-3 text-teal-mid">
              <span>{state.team.name} · Table {state.team.tableNumber}</span>
              <button type="button" onClick={signOut} className="inline-flex items-center gap-1 normal-case tracking-normal text-muted hover:text-ink"><LogOut size={13} /> Sign out</button>
            </p>
            <h1 className="mt-2 font-display text-h1 text-ink">{inSuddenDeath ? "Sudden death" : round ? round.title : "Waiting for the first round"}</h1>
          </div>
          {round && (round.state === "open" || round.state === "paused") && (
            <div className={cn("tile shrink-0 px-5 py-3 text-right text-white", round.state === "paused" ? "bg-warning" : remainingMs <= 60_000 ? "bg-danger" : "bg-teal-dark")}>
              <p className="kicker flex items-center justify-end gap-1 text-white/75">{round.state === "paused" ? <><Pause size={12} /> Paused</> : debateSegment(remainingMs).label}</p>
              <p className="font-mono text-3xl font-bold tabular-nums" aria-live="off">{formatSeconds(remainingMs)}</p>
            </div>
          )}
        </div>

        {state.suddenDeath && <SuddenDeathPanel key={state.suddenDeath.id} suddenDeath={state.suddenDeath} serverNowMs={serverNowMs} onSaved={savedSuddenDeath} firstSight={firstSight} />}

        {state.reveal && <CaptainReveal reveal={state.reveal} firstSight={firstSight} />}

        {inSuddenDeath ? null : !round ? (
          <div className="card card-xl flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
            <Mascot className="h-40" />
            <div>
              <p className="kicker text-accent">You&apos;re signed in</p>
              <h2 className="mt-2 font-display text-h2 text-ink">Keep this screen open.</h2>
              <p className="mt-3 text-lead text-muted">The scenario appears here automatically when the emcee opens the round.</p>
            </div>
          </div>
        ) : (
          <section className="card card-xl p-5 sm:p-8">
            {round.phase === "trial" && <Notice tone="success" className="mb-5 flex gap-3"><Award className="mt-1 shrink-0" size={18} /><p><strong>Practice round: nothing counts.</strong> Try the drag-and-drop, lock in three picks, and watch the reveal. The real game starts with Round 1.</p></Notice>}
            {state.standing === "playing-along" && <Notice className="mb-5 flex gap-3"><Gift className="mt-1 shrink-0" size={18} /><p><strong>You&apos;re playing for the chocolate hamper.</strong> Keep submitting. The highest six-round score outside the Top 2 wins it.</p></Notice>}
            {!isOpen && round.state !== "paused" && !state.reveal && <Notice className="mb-5 font-medium">{round.phase === "final" && round.state !== "revealed" ? "Answers locked. The stage results stay secret until after Round 6, so watch the main screen." : "This round is closed. Watch the main screen for the Boardroom Choices."}</Notice>}

            <div className="max-w-3xl border-b border-rule pb-6">
              <p className="kicker flex flex-wrap items-center gap-3 text-accent">The Board says{round.multiplier > 1 ? ` · ${round.multiplier}× points` : ""}{round.leadHat && <span className="flex items-center gap-1.5 rounded-full bg-panel-teal px-2.5 py-0.5 text-teal-base"><HardHat size={12} /> Lead hat: {round.leadHat}</span>}</p>
              <h2 className="mt-3 whitespace-pre-line font-display text-h3 text-ink">{round.scenario}</h2>
              {round.context && <p className="mt-2 italic leading-7 text-muted">{round.context}</p>}
              {isOpen && <p className="mt-3 leading-7 text-muted">Drag your three strongest options into the ranked slots below, or tap an option to drop it into the next empty slot.</p>}
            </div>

            <DndContext id="captain-ranking" sensors={sensors} onDragStart={({ active }) => setDragging(String(active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {round.options.map((option) => <DraggableOption key={option.id} option={option} place={slots.indexOf(option.id)} disabled={!isOpen} onTap={() => tap(option.id)} />)}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <span className="kicker text-teal-mid">Your ranking</span>
                {isOpen && picks.length > 0 && <button type="button" onClick={() => setSlots(toSlots([]))} className="text-sm font-medium text-muted hover:text-ink">Clear all</button>}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {slots.map((optionId, index) => <DropSlot key={index} index={index} option={optionById(optionId)} disabled={!isOpen} onClear={() => clearSlot(index)} />)}
              </div>

              <DragOverlay dropAnimation={null}>{draggedOption && <OptionCard option={draggedOption} badge={draggedOption.id} lifted />}</DragOverlay>
            </DndContext>

            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-rule pt-5 sm:flex-row sm:items-center">
              <p className={cn("text-sm", error ? "font-semibold text-danger" : isOpen && saved && sameAsSaved ? "font-semibold text-success" : "text-muted")} role="status">{status}</p>
              {isOpen && (
                <Button variant="primary" size="lg" disabled={picks.length !== 3 || saving || sameAsSaved} onClick={submit} className="shrink-0">
                  {saving ? "Saving…" : saved && sameAsSaved ? <><Check size={17} /> Saved</> : <>{saved ? "Update answer" : "Lock it in"} <ChevronRight size={17} /></>}
                </Button>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function OptionCard({ option, badge, placed, lifted }: { option: Option; badge: string; placed?: boolean; lifted?: boolean }) {
  return (
    <div className={cn("tile flex min-h-[80px] items-start gap-3 border p-4 text-left transition", lifted ? "rotate-1 border-accent bg-white shadow-xl" : placed ? "border-accent/50 bg-panel-orange" : "border-rule bg-white")}>
      <span className={cn("chip grid h-8 w-8 shrink-0 place-items-center text-sm font-bold", placed || lifted ? "bg-accent text-white" : "bg-panel-teal text-teal-base")}>{badge}</span>
      <span className="flex-1 pr-1 text-sm leading-6 text-ink"><strong className="mr-1">{option.id}.</strong>{option.text}</span>
      <GripVertical size={16} className="mt-1 shrink-0 text-faint" aria-hidden />
    </div>
  );
}

function DraggableOption({ option, place, disabled, onTap }: { option: Option; place: number; disabled: boolean; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: option.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      onClick={onTap}
      aria-label={`${option.id}. ${option.text}${place >= 0 ? `, ranked #${place + 1}` : ""}`}
      className={cn("tile block w-full text-left enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-default", isDragging ? "opacity-30" : place >= 0 ? "opacity-75" : "enabled:hover:[&>div]:border-teal-mid enabled:hover:[&>div]:bg-panel-teal")}
    >
      <OptionCard option={option} badge={place >= 0 ? `#${place + 1}` : option.id} placed={place >= 0} />
    </button>
  );
}

function DropSlot({ index, option, disabled, onClear }: { index: number; option: Option | undefined; disabled: boolean; onClear: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: SLOT_PREFIX + index, disabled });
  return (
    <div ref={setNodeRef} className={cn("tile flex min-h-[112px] flex-col border-2 p-3 transition", isOver ? "scale-[1.02] border-accent bg-panel-orange" : option ? "border-teal-mid bg-panel-teal" : "border-dashed border-rule-strong bg-surface")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="kicker text-teal-base">#{index + 1} · {POINTS_BY_BOARDROOM_RANK[index]} pts</span>
        {option && !disabled && <button type="button" onClick={onClear} aria-label={`Remove ${option.id} from #${index + 1}`} className="chip p-1 text-muted hover:bg-white hover:text-ink"><X size={14} /></button>}
      </div>
      {option
        ? <p key={option.id} className="animate-in fade-in zoom-in-95 text-sm leading-6 text-ink duration-200"><strong className="mr-1 text-accent-deep">{option.id}.</strong>{option.text}</p>
        : <p className="m-auto text-sm text-faint">{disabled ? "—" : "Drop an option here"}</p>}
    </div>
  );
}

function hasFirstPickBonus(reveal: Reveal) {
  const boardroomFirst = reveal.revealed.find((choice) => choice.rank === 1)?.optionId;
  return Boolean(boardroomFirst) && reveal.myChoices?.[0] === boardroomFirst;
}

/** The projector's reveal, mirrored on the Captain's phone with their own picks scored against it. */
function CaptainReveal({ reveal, firstSight }: { reveal: Reveal; firstSight: (key: string) => boolean }) {
  const myChoices = reveal.myChoices ?? [];
  const firstPickBonus = hasFirstPickBonus(reveal);

  useEffect(() => {
    if (reveal.step === 0 || reveal.step > 3 || !firstSight(`${reveal.roundId}:${reveal.step}`)) return;
    const picked = (optionId: string) => reveal.myChoices?.includes(optionId) ?? false;
    const matched = reveal.revealed.filter((choice) => picked(choice.optionId)).length;
    const newest = reveal.revealed[reveal.revealed.length - 1];
    if (reveal.step >= 3 && (matched === 3 || hasFirstPickBonus(reveal))) grandFinale();
    else if (newest && picked(newest.optionId)) burst(newest.rank === 1 ? 2 : 1);
  }, [reveal, firstSight]);

  return (
    <section className="card-xl mb-6 overflow-hidden bg-teal-dark p-5 text-cream sm:p-7">
      <p className="kicker mb-2 flex items-center gap-2 text-cyan-soft"><Award size={14} /> {reveal.title} · The Boardroom Choices</p>
      <h2 className="font-display text-h2">{reveal.step === 0 ? "The reveal is starting…" : reveal.step >= 3 ? "The Boardroom has spoken" : "Revealing on the main screen"}<span className="text-accent">.</span></h2>
      {reveal.revealed.length > 0 && (
        <div className="mt-5 grid gap-2">
          {[...reveal.revealed].reverse().map((choice) => {
            const mine = myChoices.indexOf(choice.optionId);
            return (
              <div key={choice.rank} className={cn("tile animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 border p-3 duration-500", mine >= 0 ? "border-accent bg-accent/15" : "border-rule-light bg-cream/5")}>
                <span className="tile grid h-10 w-10 shrink-0 place-items-center bg-accent font-display text-lg font-bold text-white">#{choice.rank}</span>
                <p className="min-w-0 flex-1 text-sm leading-snug"><strong className="mr-1 text-orange-soft">{choice.optionId}.</strong>{choice.text}</p>
                <span className={cn("shrink-0 text-right text-xs font-semibold", mine >= 0 ? "text-orange-soft" : "text-cream/50")}>{mine >= 0 ? <>✓ Your #{mine + 1}<br />+{POINTS_BY_BOARDROOM_RANK[choice.rank - 1]}</> : "Not in your picks"}</span>
              </div>
            );
          })}
        </div>
      )}
      {!reveal.myChoices && <p className="mt-4 text-sm text-cream/70">No answer was saved for this round.</p>}
      {reveal.points !== null && reveal.myChoices && (
        <div className="tile animate-in fade-in zoom-in-95 mt-4 flex flex-wrap items-center gap-3 bg-cream/10 px-4 py-3 duration-700">
          <span className="text-sm text-cream/75">{reveal.practice ? "You would have scored" : "Your round score"}</span>
          <span className="font-mono text-2xl font-bold text-orange-soft">{reveal.points} pts</span>
          {firstPickBonus && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">+10 first-pick bonus</span>}
        </div>
      )}
    </section>
  );
}

/** A sudden death on this device: tied teams pick one of four options; everyone else is told to watch the main screen. */
function SuddenDeathPanel({ suddenDeath, serverNowMs, onSaved, firstSight }: { suddenDeath: SuddenDeath; serverNowMs: number; onSaved: (suddenDeathId: string, choice: string) => void; firstSight: (key: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(suddenDeath.myChoice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const remaining = suddenDeath.state === "open" ? Date.parse(suddenDeath.closesAt) - serverNowMs : 0;
  const open = remaining > 0;
  const unchanged = draft !== null && draft === suddenDeath.myChoice;

  useEffect(() => {
    if (suddenDeath.won && firstSight(`sudden:${suddenDeath.id}:won`)) grandFinale();
  }, [suddenDeath.won, suddenDeath.id, firstSight]);

  async function submit() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await postJson<{ result: { choice: string } }>("/api/team/sudden-death", { suddenDeathId: suddenDeath.id, value: draft });
      if (!result.ok) { setError(result.error); return; }
      onSaved(suddenDeath.id, result.data.result.choice);
    } finally {
      setSaving(false);
    }
  }

  if (!suddenDeath.playing) {
    return <Notice tone="warning" className="mb-6 flex items-center gap-3"><Siren size={18} className="shrink-0" /><span><strong>Sudden death in progress.</strong> The tied teams are answering one question. Watch the main screen.</span></Notice>;
  }

  const shownChoice = open ? draft : suddenDeath.myChoice;
  return (
    <section className="card-xl mb-6 overflow-hidden border-2 border-danger bg-white p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <p className="kicker flex items-center gap-2 text-danger"><Siren size={14} /> Sudden death · {suddenDeath.questionKey} · You&apos;re in it</p>
        <span className={cn("tile px-4 py-2 font-mono text-2xl font-bold tabular-nums text-white", open ? (remaining <= 10_000 ? "bg-danger" : "bg-teal-dark") : "bg-ink")}>{open ? formatSeconds(remaining) : "Locked"}</span>
      </div>
      <h2 className="font-display text-h3 text-ink">{suddenDeath.question}</h2>
      <p className="mt-2 text-sm text-muted">Pick one. Only the right answer counts.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Sudden-death options">
        {suddenDeath.options.map((option) => {
          const chosen = shownChoice === option.id;
          const right = suddenDeath.correct === option.id;
          const revealed = suddenDeath.correct !== null;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={!open || saving}
              onClick={() => { setDraft(option.id); setError(""); }}
              className={cn(
                "tile flex min-h-16 items-center gap-3 border-2 p-4 text-left text-base font-semibold transition enabled:active:scale-[0.98]",
                revealed ? (right ? "border-accent bg-panel-orange text-ink" : chosen ? "border-rule-strong bg-surface-sunk text-muted" : "border-rule bg-white text-faint")
                  : chosen ? "border-accent bg-panel-orange text-ink" : "border-rule bg-white text-ink enabled:hover:border-teal-mid",
              )}
            >
              <span className={cn("chip grid h-10 w-10 shrink-0 place-items-center font-display text-lg font-bold", chosen || (revealed && right) ? "bg-accent text-white" : "bg-panel-teal text-teal-base")}>{revealed && right ? <Check size={20} /> : option.id}</span>
              <span className="min-w-0 flex-1">{option.text}</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn("text-sm", error ? "font-semibold text-danger" : unchanged ? "font-semibold text-success" : "text-muted")} role="status">
            {error || (unchanged ? `Locked in ✓ ${suddenDeath.myChoice}. You can change it until time runs out.` : draft ? `Tap Lock it in to save ${draft}.` : "Tap an option, then lock it in.")}
          </p>
          <Button variant="primary" size="lg" disabled={!draft || saving || unchanged} onClick={submit} className="shrink-0">{saving ? "Saving…" : unchanged ? <><Check size={17} /> Locked in</> : suddenDeath.myChoice ? "Update" : "Lock it in"}</Button>
        </div>
      )}
      {!open && <p className="mt-4 text-lg text-ink">Your answer: <strong className="font-mono">{suddenDeath.myChoice ?? "none"}</strong></p>}
      {suddenDeath.won === true && <p className="tile animate-in fade-in zoom-in-95 mt-4 flex items-center gap-2 bg-accent px-4 py-3 font-bold text-white duration-700"><Crown size={18} /> Right answer. You win the sudden death!</p>}
      {suddenDeath.won === false && <p className="tile mt-4 bg-surface-sunk px-4 py-3 text-sm font-semibold text-muted">Not this time.</p>}
    </section>
  );
}
