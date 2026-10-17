"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Crown, Gavel, Siren, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/field";
import { Notice } from "@/components/ui/Notice";
import { askReason, formatSeconds } from "@/lib/format";
import { cutoffTie } from "@/lib/game/scoring";
import { cn } from "@/lib/utils";
import { SuddenDeathSteps } from "./ProjectorTab";
import type { Overview, TabProps } from "./types";

type StageKey = "top2" | "final" | "audience";
type Tie = NonNullable<ReturnType<typeof cutoffTie>>;
type SuddenDeath = Overview["suddenDeaths"][number];

const STAGE_INFO: Record<StageKey, { title: string; eyebrow: string; places: number; standings: keyof Overview["standings"]; confirm: string; note: string }> = {
  top2: { title: "Top 2 after Round 4", eyebrow: "Rounds 1–4 cumulative · all teams · a tie at the cutoff goes to sudden death", places: 2, standings: "prelim", confirm: "Confirm Top 2", note: "Locks once Round 5 opens. Reveal it from Screen control." },
  final: { title: "Winner & runner-up", eyebrow: "Rounds 5–6 combined · Top 2 only · scores reset for the stage", places: 1, standings: "final", confirm: "Confirm winner", note: "Revealed last in the Awards." },
  audience: { title: "Chocolate hamper", eyebrow: "Highest six-round score outside the Top 2", places: 1, standings: "audience", confirm: "Confirm hamper winner", note: "Revealed first in the Awards." },
};

function StageCard({ stage, overview, act, busy, serverOffset }: { stage: StageKey } & Pick<TabProps, "overview" | "act" | "busy" | "serverOffset">) {
  const info = STAGE_INFO[stage];
  const ranked = overview.standings[info.standings];
  const tie = cutoffTie(ranked, info.places);
  const confirmed = overview.qualifications.filter((row) => row.stage === stage);
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const tiedIds = new Set(tie?.tied.map((entry) => entry.teamId));
  // Ticks only count while the team is still in the tied group, so a re-score that changes the tie can't carry stale picks.
  const validPicks = picks.filter((pick) => tiedIds.has(pick));
  // Long lists (qualifiers, hamper) only need the top of the table plus anyone in a tie.
  const visible = ranked.filter((entry, index) => index < Math.max(info.places + 5, 8) || tiedIds.has(entry.teamId));

  async function confirm(extra: Record<string, unknown> = {}) {
    const result = await act(
      { action: "qualify", stage, ...extra },
      (value) => (value as { needsRuling?: boolean } | null)?.needsRuling ? null : tie ? "Tie decided and confirmed." : `${info.title} confirmed. Reveal it from Screen control.`,
    ) as { needsRuling?: boolean } | undefined;
    if (result?.needsRuling) window.alert("Scores changed and there is now a tie at the cutoff. Nothing was saved. Run a sudden death or record a ruling.");
    else if (result) { setPicks([]); setNote(""); }
  }

  return (
    <Card eyebrow={info.eyebrow} title={info.title} action={confirmed.length ? <span className="flex items-center gap-1.5 rounded-full bg-panel-success px-3 py-1 text-xs font-semibold text-success"><CheckCircle2 size={14} /> Confirmed</span> : undefined}>
      {confirmed.length > 0 && (
        <div className="tile mb-4 bg-panel-teal p-3 text-sm">
          <p className="font-semibold text-ink">{confirmed.map((row) => stage === "final" ? `${row.rank === 1 ? "Winner" : "Runner-up"}: ${row.name}` : `#${row.rank} ${row.name} (${row.score})`).join(" · ")}</p>
          {confirmed[0].rulingNote && <p className="mt-1 flex gap-1.5 text-xs text-muted"><Gavel size={13} className="mt-0.5 shrink-0" /> Ruling: {confirmed[0].rulingNote}</p>}
        </div>
      )}
      {ranked.length === 0 ? <p className="text-sm text-muted">No scores yet.</p> : (
        <table className="w-full text-left text-sm">
          <tbody>
            {visible.map((entry, index) => {
              const isTied = tiedIds.has(entry.teamId);
              return (
                <tr key={entry.teamId} className={cn(index === info.places ? "border-t-2 border-dashed border-accent" : "border-t border-rule", isTied && "bg-panel-warning")}>
                  <td className="w-10 py-1.5 font-mono text-muted">{entry.rank}</td>
                  <td className="font-medium text-ink">{entry.name}</td>
                  <td className="text-right font-mono">{entry.score}</td>
                  <td className="w-24 text-right">{isTied && <label className="inline-flex items-center gap-1 text-xs font-semibold text-warning" title="Only for a manual Game Jury ruling"><input type="checkbox" checked={validPicks.includes(entry.teamId)} onChange={(event) => setPicks((current) => event.target.checked ? [...current.filter((pick) => tiedIds.has(pick)), entry.teamId] : current.filter((pick) => pick !== entry.teamId))} /> through</label>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tie ? (
        <>
          <TieBreaker stage={stage} tie={tie} overview={overview} act={act} busy={busy} serverOffset={serverOffset} onConfirm={(suddenDeathId) => confirm({ suddenDeathId })} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-muted">Game Jury ruling instead (fallback)</summary>
            <p className="mt-2 text-ink">Tick {tie.slots} tied team{tie.slots > 1 ? "s" : ""} above and record why.</p>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ruling, e.g. 'Sudden death on paper: Alpha closest'" className={cn(inputClass, "mt-2 w-full")} />
            <Button variant="outline" className="mt-2" disabled={busy || validPicks.length !== tie.slots || !note.trim()} onClick={() => confirm({ selectedTeamIds: validPicks, note })}><Gavel size={14} /> Record ruling &amp; confirm</Button>
          </details>
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy || ranked.length === 0} onClick={() => confirm()}>{confirmed.length ? "Re-confirm" : info.confirm}</Button>
          <span className="text-xs text-muted">{info.note}</span>
        </div>
      )}
      {stage === "audience" && <div className="mt-3"><Button disabled={busy} onClick={() => act({ action: "publish-audience", roundId: "round-4" }, "The hamper race Top 5 is now on the projector.")}>Show hamper race Top 5 after R4</Button></div>}
    </Card>
  );
}

/** Runs the sudden death for a tied cutoff: pick a question, watch the answers come in, reveal, confirm. */
function TieBreaker({ stage, tie, overview, act, busy, serverOffset, onConfirm }: { stage: StageKey; tie: Tie; onConfirm: (suddenDeathId: string) => void } & Pick<TabProps, "overview" | "act" | "busy" | "serverOffset">) {
  const tiedIds = new Set(tie.tied.map((entry) => entry.teamId));
  // The newest sudden death for this award that is about the current tie (a replay covers a subset of it).
  const latest = overview.suddenDeaths.find((record) => record.stage === stage && record.teams.every((team) => tiedIds.has(team.teamId)));
  const replay = latest && latest.state !== "open" && latest.result.stillTied.length > 0 ? latest : undefined;
  // A new question only when none has run yet, or the last one left teams level. (The Game Jury fallback covers anything else.)
  const showForm = !latest || Boolean(replay);

  return (
    <div className="tile mt-4 border border-warning/30 bg-panel-warning p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-warning"><AlertTriangle size={15} /> Tie at the cutoff: {tie.tied.length} teams on {tie.tied[0].score} for {tie.slots} place{tie.slots > 1 ? "s" : ""}.</p>
      <p className="mt-1 text-ink">Tied teams play a multiple-choice sudden death on their Captain devices. Only a correct pick counts; if teams are still level, run another question for just them.</p>
      {latest && <SuddenDeathLive record={latest} overview={overview} act={act} busy={busy} serverOffset={serverOffset} onConfirm={onConfirm} />}
      {showForm && <StartSuddenDeath key={replay?.id ?? "new"} stage={stage} replay={replay} overview={overview} act={act} busy={busy} />}
    </div>
  );
}

const LETTERS = ["A", "B", "C", "D"] as const;

function StartSuddenDeath({ stage, replay, overview, act, busy }: { stage: StageKey; replay?: SuddenDeath } & Pick<TabProps, "overview" | "act" | "busy">) {
  const used = new Set(overview.suddenDeaths.map((record) => record.questionKey));
  const firstUnused = overview.suddenDeathBank.find((item) => !used.has(item.key) && item.correct !== null) ?? overview.suddenDeathBank[0];
  const [key, setKey] = useState(firstUnused?.key ?? "custom");
  const preset = overview.suddenDeathBank.find((item) => item.key === key);
  const [question, setQuestion] = useState(preset?.question ?? "");
  const [options, setOptions] = useState<string[]>(preset?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState<string>(preset?.correct ?? "");
  const filled = options.map((option) => option.trim());
  const ready = question.trim() !== "" && filled.every(Boolean) && new Set(filled.map((option) => option.toLowerCase())).size === 4 && LETTERS.includes(correct as (typeof LETTERS)[number]);

  function choose(nextKey: string) {
    setKey(nextKey);
    const item = overview.suddenDeathBank.find((candidate) => candidate.key === nextKey);
    setQuestion(item?.question ?? "");
    setOptions(item?.options ?? ["", "", "", ""]);
    setCorrect(item?.correct ?? "");
  }

  async function start() {
    if (!window.confirm(`Start the sudden death now? The projector switches to the question and ${replay ? replay.result.stillTied.length : "the tied"} teams get 60 seconds to answer. The correct answer is ${correct}.`)) return;
    await act({ action: "start-sudden-death", stage, questionKey: key === "custom" ? "SD" : key, question, options: filled, correctOption: correct, previousId: replay?.id }, "Sudden death started. The projector shows the question.");
  }

  return (
    <div className="mt-3 rounded-lg border border-rule bg-white p-3 text-ink">
      <p className="kicker mb-2 flex items-center gap-1.5 text-danger"><Siren size={13} /> {replay ? `Still level: run another question for ${replay.teams.filter((team) => replay.result.stillTied.includes(team.teamId)).map((team) => team.name).join(", ")}` : "Start sudden death"}</p>
      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <select value={key} onChange={(event) => choose(event.target.value)} className={inputClass} aria-label="Question">
          {overview.suddenDeathBank.map((item) => <option key={item.key} value={item.key}>{item.key}{used.has(item.key) ? " (used)" : ""}</option>)}
          <option value="custom">Custom</option>
        </select>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Question" className={inputClass} aria-label="Question text" />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {LETTERS.map((letter, index) => (
          <label key={letter} className={cn("flex items-center gap-2 rounded-lg border p-1.5", correct === letter ? "border-success bg-panel-success" : "border-rule")}>
            <input type="radio" name={`correct-${stage}`} checked={correct === letter} onChange={() => setCorrect(letter)} aria-label={`${letter} is correct`} />
            <span className="w-4 font-bold">{letter}</span>
            <input value={options[index]} onChange={(event) => setOptions(options.map((option, at) => at === index ? event.target.value : option))} placeholder={`Option ${letter}`} className={cn(inputClass, "h-8 min-w-0 flex-1")} aria-label={`Option ${letter}`} />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Tick the correct option. Only teams that pick it go through.{preset?.note ? ` ${preset.note}` : ""}</p>
      <Button variant="primary" className="mt-3" disabled={busy || !ready} onClick={start}><Siren size={14} /> Start sudden death</Button>
    </div>
  );
}

function SuddenDeathLive({ record, overview, act, busy, serverOffset, onConfirm }: { record: SuddenDeath; onConfirm: (suddenDeathId: string) => void } & Pick<TabProps, "overview" | "act" | "busy" | "serverOffset">) {
  const [tick, setTick] = useState(() => Date.now());
  const open = record.state === "open";
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [open]);
  const remaining = open ? Date.parse(record.closesAt) - (tick + serverOffset) : 0;
  const winners = new Set(record.result.winners);
  const correctText = record.options.find((option) => option.id === record.correctOption)?.text ?? "";
  const resolved = !open && record.result.stillTied.length === 0;

  async function manual(team: { teamId: string; name: string }) {
    const raw = window.prompt(`Letter (A, B, C or D) for ${team.name}:`);
    if (raw === null) return;
    const choice = raw.trim().toUpperCase();
    if (!LETTERS.includes(choice as (typeof LETTERS)[number])) { window.alert("Enter A, B, C or D."); return; }
    const reason = askReason("entering this sudden-death answer");
    if (reason) await act({ action: "manual-sudden-death", suddenDeathId: record.id, teamId: team.teamId, choice, reason }, `Recorded ${choice} for ${team.name}.`);
  }

  return (
    <div className="mt-3 rounded-lg border border-rule bg-white p-3 text-ink">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="kicker text-danger">{record.questionKey} · {open ? "answers open" : "closed"}</p>
          <p className="font-semibold">{record.question}</p>
          <p className="text-xs text-muted">Correct: <strong className="text-ink">{record.correctOption} · {correctText}</strong> · {record.slots} place{record.slots > 1 ? "s" : ""}</p>
        </div>
        {open && <span className={cn("tile px-3 py-1.5 font-mono text-xl font-bold text-white", remaining <= 10_000 ? "bg-danger" : "bg-teal-dark")}>{formatSeconds(remaining)}</span>}
      </div>
      <table className="mt-2 w-full text-left text-sm">
        <tbody>
          {record.teams.map((team) => (
            <tr key={team.teamId} className={cn("border-t border-rule", !open && winners.has(team.teamId) && "bg-panel-orange")}>
              <td className="py-1.5 font-medium">{!open && winners.has(team.teamId) && <Crown size={13} className="mr-1 inline text-accent" />}{team.name}</td>
              <td className="text-right font-mono font-bold">{team.choice ?? <span className="font-normal text-faint">—</span>}</td>
              <td className="w-10 text-right">{team.choice && (team.choice === record.correctOption ? <span className="text-success">✓</span> : <span className="text-danger">✗</span>)}</td>
              <td className="w-16 text-right"><button type="button" disabled={busy} onClick={() => manual(team)} className="text-xs font-semibold text-teal-mid hover:underline">Enter</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {open && <Button variant="danger" disabled={busy} onClick={() => act({ action: "close-sudden-death", id: record.id }, "Sudden death closed. Reveal the answer, then the picks.")}><Square size={13} /> Close now</Button>}
        <SuddenDeathSteps overview={overview} act={act} busy={busy} suddenDeathId={record.id} closed={!open} />
      </div>
      {!open && record.result.stillTied.length > 0 && <Notice tone="warning" className="mt-3">{record.result.winners.length ? "Some places are decided, but " : ""}Still level ({record.teams.filter((team) => record.result.stillTied.includes(team.teamId)).map((team) => team.name).join(", ")}). Run another question for just those teams below.</Notice>}
      {resolved && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy} onClick={() => onConfirm(record.id)}><CheckCircle2 size={14} /> Confirm with this result</Button>
          <span className="text-xs text-muted">Through: {[...record.carried, ...record.result.winners].map((teamId) => overview.teams.find((team) => team.id === teamId)?.name ?? teamId).join(", ")}. The picks are recorded as the ruling.</span>
        </div>
      )}
    </div>
  );
}

export function ResultsTab({ overview, act, busy, serverOffset }: TabProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {(Object.keys(STAGE_INFO) as StageKey[]).map((stage) => <StageCard key={stage} stage={stage} overview={overview} act={act} busy={busy} serverOffset={serverOffset} />)}
    </div>
  );
}
