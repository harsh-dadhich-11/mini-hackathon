"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Award, Check, ChevronRight, Clock3, GripVertical, LogOut, Pause, UsersRound, X } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import { burst, grandFinale } from "@/lib/celebrate";
import type { getTeamState } from "@/lib/event-store";
import { POINTS_BY_BOARDROOM_RANK } from "@/lib/scoring";
import { usePoll } from "@/lib/use-poll";
import { useHydrated, useServerClock } from "@/lib/use-server-clock";

type TeamState = Awaited<ReturnType<typeof getTeamState>>;
type Option = { id: string; text: string };
type Slots = (string | null)[];
type Reveal = NonNullable<TeamState["reveal"]>;

const POLL_MS = 2000;
const SLOT_PREFIX = "slot-";

function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

const toSlots = (choices: string[] | undefined): Slots => [0, 1, 2].map((index) => choices?.[index] ?? null);

export function TeamClient({ initial }: { initial: TeamState }) {
  const [state, setState] = useState(initial);
  const { serverNowMs, sync } = useServerClock(initial.serverNow);
  const hydrated = useHydrated();
  const [slots, setSlots] = useState<Slots>(toSlots(initial.submission?.choices));
  const [roundId, setRoundId] = useState(initial.round?.id ?? null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Mouse drags start after a small move; touch drags need a short press so the page still scrolls.
  // Keyboard users get the tap behaviour (Enter/Space on an option) instead of a keyboard drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  usePoll(async () => {
    const response = await fetch("/api/team/state", { cache: "no-store" }).catch(() => null);
    if (response?.status === 401) { window.location.reload(); return; }
    if (!response?.ok) return;
    const next = await response.json() as TeamState;
    sync(next.serverNow);
    setState(next);
  }, POLL_MS);

  // A new round starts with that round's saved answer (or a blank slate).
  if ((state.round?.id ?? null) !== roundId) {
    setRoundId(state.round?.id ?? null);
    setSlots(toSlots(state.submission?.choices));
    setError("");
  }

  const round = state.round;
  const isOpen = round?.state === "open" && round.inputMode !== "master-paddle";
  const remainingMs = round?.state === "paused" ? round.pausedRemainingMs ?? 0 : isOpen && round.closesAt ? Date.parse(round.closesAt) - serverNowMs : 0;
  const saved = state.submission;
  const picks = slots.filter((slot): slot is string => slot !== null);
  const unsaved = isOpen && picks.length === 3 && picks.join() !== saved?.choices.join();
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

  const draggedOption = optionById(dragging);

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

        {state.reveal && <CaptainReveal reveal={state.reveal} initial={initial.reveal} />}

        {!round ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><Clock3 className="mb-5 text-[#0e6a68]" size={28} /><h2 className="font-display text-2xl font-bold text-slate-900">You&apos;re signed in.</h2><p className="mt-3 text-slate-600">Keep this screen open. The scenario appears here automatically when the emcee opens the round.</p></div>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {state.standing === "playing-along" && <div className="mb-5 flex gap-3 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm leading-6 text-[#275c58]"><UsersRound className="mt-0.5 shrink-0" size={19} /><p><strong>You&apos;re playing along.</strong> Keep submitting. Your answers count towards the Audience Champion, not the official scorecard.</p></div>}
            {round.inputMode === "master-paddle" ? <div className="mb-5 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm font-semibold text-[#275c58]">You&apos;re on the stage. Make your paddle choice; a Master records it on the control console.</div> : !isOpen && round.state !== "paused" && !state.reveal && <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">This round is closed. Watch the main screen for the Boardroom Choices.</div>}
            <div className="max-w-3xl border-b border-slate-200 pb-6">
              <p className="text-sm font-semibold text-[#0e6a68]">The Board speaks{round.multiplier > 1 ? ` · ${round.multiplier}× points` : ""}</p>
              <h2 className="mt-2 whitespace-pre-line font-display text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">{round.scenario}</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">Drag your three strongest options into the ranked slots below, or tap an option to drop it into the next empty slot.</p>
            </div>

            <DndContext id="captain-ranking" sensors={sensors} onDragStart={({ active }) => setDragging(String(active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {round.options.map((option) => <DraggableOption key={option.id} option={option} place={slots.indexOf(option.id)} disabled={!isOpen} onTap={() => tap(option.id)} />)}
              </div>

              <div className="mt-7 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Your ranking</span>
                {isOpen && picks.length > 0 && <button onClick={() => setSlots(toSlots([]))} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Clear all</button>}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {slots.map((optionId, index) => <DropSlot key={index} index={index} option={optionById(optionId)} disabled={!isOpen} onClear={() => clearSlot(index)} />)}
              </div>

              <DragOverlay dropAnimation={null}>{draggedOption && <OptionCard option={draggedOption} badge={draggedOption.id} lifted />}</DragOverlay>
            </DndContext>

            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
              <p className={"text-sm " + (error ? "font-semibold text-rose-700" : saved && !unsaved ? "font-semibold text-[#0b605c]" : "text-slate-500")} role="status">
                {error || (saved
                  ? unsaved ? "You have unsaved changes." : `Saved ✓ ${saved.choices.map((choice, index) => `#${index + 1} ${choice}`).join(" · ")} at ${hydrated ? new Date(saved.updatedAt).toLocaleTimeString() : "…"}`
                  : isOpen ? picks.length === 3 ? "Ready to lock in. You can change it until time runs out." : `Fill all three slots (${picks.length}/3).` : "No answer was saved for this round.")}
              </p>
              {isOpen && <button disabled={picks.length !== 3 || saving || !unsaved} onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5c5c] disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving…" : saved && !unsaved ? <><Check size={17} /> Saved</> : <>{saved ? "Update answer" : "Lock it in"} <ChevronRight size={17} /></>}</button>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function OptionCard({ option, badge, placed, lifted }: { option: Option; badge: string; placed?: boolean; lifted?: boolean }) {
  return (
    <div className={"flex min-h-[80px] items-start gap-3 rounded-2xl border p-4 text-left transition " + (lifted ? "rotate-1 border-[#0e6a68] bg-white shadow-xl" : placed ? "border-[#0e6a68] bg-[#e5f3ef]" : "border-slate-200 bg-white")}>
      <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold " + (placed || lifted ? "bg-[#0d5c5c] text-white" : "bg-slate-100 text-slate-600")}>{badge}</span>
      <span className="flex-1 pr-1 text-sm leading-6 text-slate-700"><strong className="mr-1 text-slate-900">{option.id}.</strong>{option.text}</span>
      <GripVertical size={16} className="mt-1 shrink-0 text-slate-300" aria-hidden />
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
      className={"block w-full rounded-2xl text-left enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-default " + (isDragging ? "opacity-30" : place >= 0 ? "opacity-70" : "enabled:hover:[&>div]:border-[#74a6a2] enabled:hover:[&>div]:bg-[#f7fbf9]")}
    >
      <OptionCard option={option} badge={place >= 0 ? `#${place + 1}` : option.id} placed={place >= 0} />
    </button>
  );
}

function DropSlot({ index, option, disabled, onClear }: { index: number; option: Option | undefined; disabled: boolean; onClear: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: SLOT_PREFIX + index, disabled });
  return (
    <div ref={setNodeRef} className={"flex min-h-[112px] flex-col rounded-2xl border-2 p-3 transition " + (isOver ? "scale-[1.02] border-[#0e6a68] bg-[#dff0eb]" : option ? "border-[#0e6a68] bg-[#f3faf7]" : "border-dashed border-slate-300 bg-slate-50")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0e6a68]">#{index + 1} · {POINTS_BY_BOARDROOM_RANK[index]} pts</span>
        {option && !disabled && <button type="button" onClick={onClear} aria-label={`Remove ${option.id} from #${index + 1}`} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={14} /></button>}
      </div>
      {option
        ? <p key={option.id} className="animate-in fade-in zoom-in-95 text-sm leading-6 text-slate-800 duration-200"><strong className="mr-1 text-[#0b605c]">{option.id}.</strong>{option.text}</p>
        : <p className="m-auto text-sm text-slate-400">{disabled ? "—" : "Drop an option here"}</p>}
    </div>
  );
}

function hasFirstPickBonus(reveal: Reveal) {
  const boardroomFirst = reveal.revealed.find((choice) => choice.rank === 1)?.optionId;
  return Boolean(boardroomFirst) && reveal.myChoices?.[0] === boardroomFirst;
}

/** The projector's reveal, mirrored on the Captain's phone with their own picks scored against it. */
function CaptainReveal({ reveal, initial }: { reveal: Reveal; initial: TeamState["reveal"] }) {
  // Starts at what the page loaded with, so a reload mid-reveal stays quiet.
  const shown = useRef(initial ? { roundId: initial.roundId, step: initial.step } : null);
  const myChoices = reveal.myChoices ?? [];
  const firstPickBonus = hasFirstPickBonus(reveal);

  useEffect(() => {
    const previousStep = shown.current?.roundId === reveal.roundId ? shown.current.step : 0;
    shown.current = { roundId: reveal.roundId, step: reveal.step };
    if (reveal.step <= previousStep) return;
    const picked = (optionId: string) => reveal.myChoices?.includes(optionId) ?? false;
    const matched = reveal.revealed.filter((choice) => picked(choice.optionId)).length;
    const newest = reveal.revealed[reveal.revealed.length - 1];
    if (reveal.step >= 3 && (matched === 3 || hasFirstPickBonus(reveal))) grandFinale();
    else if (newest && picked(newest.optionId)) burst(newest.rank === 1 ? 2 : 1);
  }, [reveal]);

  return (
    <section className="mb-6 overflow-hidden rounded-3xl bg-[#06292c] p-5 text-white shadow-lg sm:p-7">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#b8d8d1]"><Award size={14} /> {reveal.title} · The Boardroom Choices</p>
      <h2 className="font-display text-2xl font-bold">{reveal.step === 0 ? "The reveal is starting…" : reveal.step === 3 ? "The Boardroom has spoken" : "Revealing on the main screen"}<span className="text-[#e8b85b]">.</span></h2>
      {reveal.revealed.length > 0 && (
        <div className="mt-4 grid gap-2">
          {[...reveal.revealed].reverse().map((choice) => {
            const mine = myChoices.indexOf(choice.optionId);
            return (
              <div key={choice.rank} className={"animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 rounded-2xl border p-3 duration-500 " + (mine >= 0 ? "border-[#e8b85b] bg-[#e8b85b]/15" : "border-white/10 bg-white/[0.04]")}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8b85b] font-display text-lg font-black text-[#073638]">#{choice.rank}</span>
                <p className="min-w-0 flex-1 text-sm leading-snug"><strong className="mr-1 text-[#e8b85b]">{choice.optionId}.</strong>{choice.text}</p>
                <span className={"shrink-0 text-right text-xs font-semibold " + (mine >= 0 ? "text-[#f4c866]" : "text-white/50")}>{mine >= 0 ? <>✓ Your #{mine + 1}<br />+{POINTS_BY_BOARDROOM_RANK[choice.rank - 1]}</> : "Not in your picks"}</span>
              </div>
            );
          })}
        </div>
      )}
      {!reveal.myChoices && <p className="mt-4 text-sm text-[#c3dcd7]">No answer was saved for this round.</p>}
      {reveal.points !== null && reveal.myChoices && (
        <div className="animate-in fade-in zoom-in-95 mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 duration-700">
          <span className="text-sm text-[#c3dcd7]">Your round score</span>
          <span className="font-mono text-2xl font-bold text-[#f4c866]">{reveal.points} pts</span>
          {firstPickBonus && <span className="rounded-full bg-[#e8b85b] px-3 py-1 text-xs font-bold text-[#073638]">+10 first-pick bonus</span>}
        </div>
      )}
    </section>
  );
}
