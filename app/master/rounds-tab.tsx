"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Check, Pencil, Upload } from "lucide-react";
import { Btn, Card, inputClass, StateBadge, type Round, type TabProps } from "./master-ui";

type Draft = { id: string; title: string; scenario: string; options: { id: string; text: string }[]; answers: string[]; evidence: string[]; durationSeconds: number; multiplier: number };

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
    options: options.length === 6 ? options : Array.from({ length: 6 }, (_, index) => ({ id: String.fromCharCode(65 + index), text: "" })),
    answers: answers.length === 3 ? answers : ["A", "B", "C"],
    evidence: [0, 1, 2].map((index) => evidence[index] ?? ""),
    durationSeconds: round.durationSeconds,
    multiplier: round.multiplier,
  };
}

const SAMPLE = `[
  {
    "id": "round-1",
    "title": "Round 1 · Business Pressure",
    "scenario": "Your largest client asks for a 15% rate cut...",
    "options": [{ "id": "A", "text": "..." }, { "id": "B", "text": "..." }, "... 6 in total"],
    "answers": ["C", "F", "A"],
    "evidence": ["Why #1 ...", "Why #2 ...", "Why #3 ..."],
            "multiplier": 1
  }
]`;

export function RoundsTab({ overview, act, busy, setNotice }: TabProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pack, setPack] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft && await act({ action: "update-round", ...draft }, `${draft.title} saved.`) !== undefined) setDraft(null);
  }

  async function importPack() {
    const rounds = parse<unknown>(pack, null);
    if (!Array.isArray(rounds)) { setNotice({ text: "The question pack must be a JSON array of rounds.", error: true }); return; }
    const result = await act({ action: "import-rounds", rounds }) as { updated: number; errors: string[] } | undefined;
    if (!result) return;
    setNotice({ text: [`${result.updated} question(s) loaded.`, ...result.errors].join("\n"), error: result.errors.length > 0 });
    if (!result.errors.length) setPack("");
  }

  return (
    <div className="space-y-5">
      {overview.rounds.length !== 6 && <Card eyebrow="Earlier prototype detected" title="Upgrade to the v4 six-round schedule"><p className="text-sm leading-6 text-slate-600">This replaces an unused earlier schedule with Rounds 1–6. It is blocked if any submissions, scores or qualifications already exist.</p><Btn variant="primary" disabled={busy} onClick={() => window.confirm("Replace the unused old schedule with the v4 six-round schedule?") && act({ action: "upgrade-v4" }, "v4 six-round schedule created.")}>Upgrade schedule to v4</Btn></Card>}
      <Card eyebrow="Editable until the round opens · answers never reach Captains" title="Questions & schedule">
        <div className="space-y-2">
          {overview.rounds.map((round) => {
            const answers = parse<string[]>(round.answersJson, []);
            return (
              <div key={round.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="font-semibold text-slate-800">{round.title}</p>
                  <p className="text-xs text-slate-500">{round.id} · {round.phase} · {Math.round(round.durationSeconds / 6) / 10} min · fixed 40/30/20 · {round.scenario ? `Boardroom ${answers.join(" › ")}` : "no content yet"}</p>
                </div>
                <div className="flex items-center gap-2"><StateBadge state={round.state} /><Btn disabled={round.state !== "draft"} onClick={() => setDraft(toDraft(round))}><Pencil size={13} /> Edit</Btn></div>
              </div>
            );
          })}
        </div>
      </Card>

      {draft && (
        <form onSubmit={save} className="rounded-2xl border border-[#cde1d9] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#0e6a68]">{draft.id}</p><h3 className="font-display text-xl font-bold text-slate-900">Edit question</h3></div><Btn type="button" onClick={() => setDraft(null)}>Cancel</Btn></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-xs font-semibold text-slate-600">Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass + " mt-1 w-full"} /></label>
            <p className="self-end rounded-lg bg-[#f4f8f6] px-3 py-2 text-xs font-semibold text-[#0e6a68]">Fixed submission lock: 6:00</p>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-600">Scenario (shown to Captains and on the projector)<textarea required value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} className={inputClass + " mt-1 h-24 w-full py-2"} /></label>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {draft.options.map((option, index) => <label key={option.id} className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf5ef] text-sm font-bold text-[#0e6a68]">{option.id}</span><input required value={option.text} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} placeholder={`Option ${option.id}`} className={inputClass + " min-w-0 flex-1"} /></label>)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((rank) => (
              <div key={rank} className="rounded-xl bg-[#f4f8f6] p-3">
                <label className="text-xs font-semibold text-slate-600">Boardroom #{rank + 1} · {[40, 30, 20][rank]} pts
                  <select value={draft.answers[rank]} onChange={(event) => setDraft({ ...draft, answers: draft.answers.map((answer, index) => index === rank ? event.target.value : answer) })} className={inputClass + " mt-1 w-full"}>{draft.options.map((option) => <option key={option.id} value={option.id}>{option.id}</option>)}</select>
                </label>
                <textarea value={draft.evidence[rank]} onChange={(event) => setDraft({ ...draft, evidence: draft.evidence.map((item, index) => index === rank ? event.target.value : item) })} placeholder="Evidence shown at the reveal" className={inputClass + " mt-2 h-20 w-full py-2 text-xs"} />
              </div>
            ))}
          </div>
          <Btn variant="primary" disabled={busy} className="mt-4 h-10"><Check size={15} /> Save question</Btn>
        </form>
      )}

      <Card eyebrow="Load every question at once (draft rounds only)" title="Import question pack (JSON)">
        <textarea value={pack} onChange={(event) => setPack(event.target.value)} placeholder={SAMPLE} className={inputClass + " h-56 w-full py-2 font-mono text-xs"} />
        <p className="mt-2 text-xs text-slate-500">Round ids: {overview.rounds.map((round) => round.id).join(", ")}. Each needs a scenario, 6 options and 3 ranked Boardroom Choices; evidence is optional. v4 uses a fixed 6:00 submission lock and 40/30/20 scoring with a +10 first-pick bonus.</p>
        <Btn variant="outline" disabled={busy || !pack.trim()} onClick={importPack} className="mt-3"><Upload size={14} /> Import</Btn>
      </Card>
    </div>
  );
}
