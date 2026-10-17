"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Check, KeyRound, PackageOpen, Pencil, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/field";
import { Notice } from "@/components/ui/Notice";
import { StateBadge } from "@/components/ui/StateBadge";
import { askReason } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Round, TabProps } from "./types";

type Draft = {
  id: string;
  title: string;
  scenario: string;
  context: string;
  leadHat: string;
  principle: string;
  othersNote: string;
  followUp: string;
  options: { id: string; text: string }[];
  answers: string[];
  evidence: string[];
  durationSeconds: number;
  multiplier: number;
};

const HATS = ["Business and Clients", "People", "Delivery and Technology", "Finance and Risk"];

/** "edit" changes everything on a draft round; "key" fixes only the Boardroom Choices of a round that has opened. */
type Mode = "edit" | "key";

function parse<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toDraft(round: Round): Draft {
  const options = parse<{ id: string; text: string }[]>(round.optionsJson, []);
  const answers = parse<string[]>(round.answersJson, []);
  const evidence = parse<string[]>(round.evidenceJson, []);
  return {
    id: round.id,
    title: round.title,
    scenario: round.scenario,
    context: round.context,
    leadHat: round.leadHat,
    principle: round.principle,
    othersNote: round.othersNote,
    followUp: round.followUp,
    options: options.length === 6 ? options : Array.from({ length: 6 }, (_, index) => ({ id: String.fromCharCode(65 + index), text: "" })),
    answers: answers.length === 3 ? answers : ["A", "B", "C"],
    evidence: [0, 1, 2].map((index) => evidence[index] ?? ""),
    durationSeconds: round.durationSeconds,
    multiplier: round.multiplier,
  };
}

// Placeholder text only: this file ships to the browser, so it must never contain a real answer key.
const SAMPLE = `[
  {
    "id": "round-1",
    "scenario": "“The Board says…”",
    "context": "You are the leadership team of…",
    "leadHat": "Finance and Risk",
    "principle": "The principle being tested",
    "options": [{ "id": "A", "text": "..." }, { "id": "B", "text": "..." }, "... 6 in total"],
    "answers": ["C", "F", "A"],
    "evidence": ["Why #1 ...", "Why #2 ...", "Why #3 ..."],
    "othersNote": "Why the other options rank lower",
    "followUp": "Stage rounds only: the emcee's follow-up question"
  }
]`;

export function RoundsTab({ overview, act, busy, setNotice }: TabProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [pack, setPack] = useState("");
  const original = draft ? overview.rounds.find((round) => round.id === draft.id) : undefined;

  function open(round: Round, nextMode: Mode) {
    setMode(nextMode);
    setDraft(toDraft(round));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (mode === "edit") {
      if (await act({ action: "update-round", ...draft }, `${draft.title} saved.`) !== undefined) setDraft(null);
      return;
    }
    const reason = askReason("correcting the Boardroom Choices");
    if (!reason) return;
    const result = await act(
      { action: "correct-answer-key", roundId: draft.id, answers: draft.answers, evidence: draft.evidence, reason },
      (value) => (value as { needsRescore?: boolean } | null)?.needsRescore
        ? "Answer key corrected. Go to Live control and click Re-score, then reveal and Republish correction."
        : "Answer key corrected. It will be used when the round is scored.",
    );
    if (result !== undefined) setDraft(null);
  }

  async function importPack() {
    const rounds = parse<unknown>(pack, null);
    if (!Array.isArray(rounds)) { setNotice({ text: "The question pack must be a JSON array of rounds.", error: true }); return; }
    const result = await act({ action: "import-rounds", rounds }) as { updated: number; errors: string[] } | undefined;
    if (!result) return;
    setNotice({ text: [`${result.updated} question(s) loaded.`, ...result.errors].join("\n"), error: result.errors.length > 0 });
    if (!result.errors.length) setPack("");
  }

  async function loadPack() {
    if (!window.confirm("Load the Partner Summit question pack into every draft round? It replaces whatever those draft rounds hold now.")) return;
    const result = await act({ action: "load-question-pack" }) as { updated: number; skipped: number; errors: string[] } | undefined;
    if (!result) return;
    setNotice({ text: [`${result.updated} question(s) loaded from the Summit pack.${result.skipped ? ` ${result.skipped} round(s) already opened were left as they are.` : ""}`, ...result.errors].join("\n"), error: result.errors.length > 0 });
  }

  const keyOnly = mode === "key";

  return (
    <div className="space-y-5">
      {!overview.scheduleCurrent && (
        <Card eyebrow="Earlier schedule detected" title="Upgrade to the current six-round schedule">
          <p className="text-sm leading-6 text-muted">A 2-minute practice round that never counts, then Rounds 1–4 as qualifiers for every team (Security Incident, AI Disruption, Talent Bomb, Business Pressure), then the Top 2 on stage for Rounds 5–6 (Client Escalation, The Acquisition). An event already on the six scored rounds just gains the practice round, keeping every question and score. An older schedule is replaced, which is blocked once any answers, scores, qualifications or sudden deaths exist.</p>
          <Button variant="primary" disabled={busy} className="mt-3" onClick={() => window.confirm("Replace the unused old schedule with the current six-round schedule?") && act({ action: "upgrade-schedule" }, "Six-round schedule created. Load the Summit question pack next.")}>Upgrade schedule</Button>
        </Card>
      )}
      <Card eyebrow="Bundled with the app · draft rounds only" title="Partner Summit question pack" action={<Button variant="primary" disabled={busy} onClick={loadPack}><PackageOpen size={14} /> Load Summit question pack</Button>}>
        <p className="text-sm leading-6 text-muted">The six reviewed scenarios, with options, Boardroom Choices, evidence, lead hats, principles, why the others rank lower, and the emcee follow-ups for Rounds 5 and 6. You can still edit any draft round afterwards.</p>
      </Card>
      <Card eyebrow="Editable until the round opens · answers never reach Captains" title="Questions & schedule">
        <div className="space-y-2">
          {overview.rounds.map((round) => {
            const answers = parse<string[]>(round.answersJson, []);
            return (
              <div key={round.id} className="tile flex flex-wrap items-center justify-between gap-3 border border-rule p-3">
                <div>
                  <p className="font-semibold text-ink">{round.title}</p>
                  <p className="text-xs text-muted">{round.id} · {round.phase} · {Math.round(round.durationSeconds / 6) / 10} min · fixed 40/30/20 · {round.scenario ? `Boardroom ${answers.join(" › ")}` : "no content yet"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StateBadge state={round.state} />
                  {round.state === "draft"
                    ? <Button onClick={() => open(round, "edit")}><Pencil size={13} /> Edit</Button>
                    : <Button onClick={() => open(round, "key")} title="Fix a wrong Boardroom Choice after the round has opened"><KeyRound size={13} /> Correct answer key</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {draft && (
        <form onSubmit={save} className="card p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><p className="kicker text-teal-mid">{draft.id}</p><h3 className="font-display text-h3 text-ink">{keyOnly ? "Correct the answer key" : "Edit question"}</h3></div>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
          </div>
          {keyOnly && <Notice tone="warning" className="mb-4">Teams have already seen this question, so only the Boardroom Choices and their evidence can change. The correction and your reason are recorded in the audit log.{original && (original.state === "scored" || original.state === "revealed") ? " This round is already scored: Re-score it afterwards." : ""}</Notice>}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-xs font-semibold text-muted">Title<input required disabled={keyOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(inputClass, "mt-1 w-full disabled:bg-surface-sunk")} /></label>
            <p className="chip self-end bg-panel-teal px-3 py-2 text-xs font-semibold text-teal-base">Fixed submission lock: {Math.floor(draft.durationSeconds / 60)}:{String(draft.durationSeconds % 60).padStart(2, "0")}</p>
          </div>
          <label className="mt-3 block text-xs font-semibold text-muted">Scenario: &ldquo;The Board says&rdquo; (shown to Captains and on the projector)<textarea required disabled={keyOnly} value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} className={cn(inputClass, "mt-1 h-24 w-full py-2 disabled:bg-surface-sunk")} /></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_240px]">
            <label className="text-xs font-semibold text-muted">Setup line (shown under the scenario)<input disabled={keyOnly} value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} placeholder="You are the leadership team of…" className={cn(inputClass, "mt-1 w-full disabled:bg-surface-sunk")} /></label>
            <label className="text-xs font-semibold text-muted">Lead hat (speaks first)<select disabled={keyOnly} value={draft.leadHat} onChange={(event) => setDraft({ ...draft, leadHat: event.target.value })} className={cn(inputClass, "mt-1 w-full disabled:bg-surface-sunk")}><option value="">None</option>{HATS.map((hat) => <option key={hat} value={hat}>{hat}</option>)}</select></label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {draft.options.map((option, index) => (
              <label key={option.id} className="flex items-center gap-2">
                <span className="chip grid h-8 w-8 shrink-0 place-items-center bg-panel-teal text-sm font-bold text-teal-base">{option.id}</span>
                <input required disabled={keyOnly} value={option.text} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} placeholder={`Option ${option.id}`} className={cn(inputClass, "min-w-0 flex-1 disabled:bg-surface-sunk")} />
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((rank) => (
              <div key={rank} className="tile bg-panel-orange p-3">
                <label className="text-xs font-semibold text-ink">Boardroom #{rank + 1} · {[40, 30, 20][rank]} pts
                  <select value={draft.answers[rank]} onChange={(event) => setDraft({ ...draft, answers: draft.answers.map((answer, index) => index === rank ? event.target.value : answer) })} className={cn(inputClass, "mt-1 w-full")}>{draft.options.map((option) => <option key={option.id} value={option.id}>{option.id}</option>)}</select>
                </label>
                <textarea aria-label={`Evidence for Boardroom #${rank + 1}`} value={draft.evidence[rank]} onChange={(event) => setDraft({ ...draft, evidence: draft.evidence.map((item, index) => index === rank ? event.target.value : item) })} placeholder="Evidence shown at the reveal" className={cn(inputClass, "mt-2 h-20 w-full py-2 text-xs")} />
              </div>
            ))}
          </div>
          <label className="mt-4 block text-xs font-semibold text-muted">Principle being tested (on the projector only after Boardroom #1)<input disabled={keyOnly} value={draft.principle} onChange={(event) => setDraft({ ...draft, principle: event.target.value })} className={cn(inputClass, "mt-1 w-full disabled:bg-surface-sunk")} /></label>
          <label className="mt-3 block text-xs font-semibold text-muted">Why the other options rank lower (shown with the principle)<textarea disabled={keyOnly} value={draft.othersNote} onChange={(event) => setDraft({ ...draft, othersNote: event.target.value })} className={cn(inputClass, "mt-1 h-20 w-full py-2 disabled:bg-surface-sunk")} /></label>
          <label className="mt-3 block text-xs font-semibold text-muted">Emcee follow-up question (stage rounds; Master console only)<input disabled={keyOnly} value={draft.followUp} onChange={(event) => setDraft({ ...draft, followUp: event.target.value })} className={cn(inputClass, "mt-1 w-full disabled:bg-surface-sunk")} /></label>
          <Button type="submit" variant="primary" size="md" disabled={busy} className="mt-4"><Check size={15} /> {keyOnly ? "Save corrected answer key" : "Save question"}</Button>
        </form>
      )}

      <Card eyebrow="Load every question at once (draft rounds only)" title="Import question pack (JSON)">
        <textarea aria-label="Question pack JSON" value={pack} onChange={(event) => setPack(event.target.value)} placeholder={SAMPLE} className={cn(inputClass, "h-56 w-full py-2 font-mono text-xs")} />
        <p className="mt-2 text-xs text-muted">Round ids: {overview.rounds.map((round) => round.id).join(", ")}. Each needs a scenario, 6 options and 3 ranked Boardroom Choices; context, lead hat, principle, evidence, others note and follow-up are optional. Every round uses a fixed 6:00 submission lock and 40/30/20 scoring with a +10 first-pick bonus.</p>
        <Button variant="outline" disabled={busy || !pack.trim()} onClick={importPack} className="mt-3"><Upload size={14} /> Import</Button>
      </Card>
    </div>
  );
}
