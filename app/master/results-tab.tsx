"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Gavel } from "lucide-react";
import { cutoffTie } from "@/lib/scoring";
import { Btn, Card, inputClass, type Overview, type TabProps } from "./master-ui";

type StageKey = "top5" | "top2" | "final" | "audience";

const STAGE_INFO: Record<StageKey, { title: string; eyebrow: string; places: number; standings: keyof Overview["standings"]; confirm: string }> = {
  top5: { title: "Top 5 after Round 3", eyebrow: "Rounds 1–3 cumulative · all teams · fifth-place ties qualify", places: 5, standings: "prelim", confirm: "Confirm Top 5" },
  top2: { title: "Top 2 after Round 4", eyebrow: "Round 4 score · Top 5 only · sudden-death ruling only at a cutoff tie", places: 2, standings: "playoff", confirm: "Confirm Top 2" },
  final: { title: "Winner & runner-up", eyebrow: "Rounds 5–6 · Top 2 stage scorecard", places: 1, standings: "final", confirm: "Confirm winner" },
  audience: { title: "Audience Champion", eyebrow: "Raw cumulative Rounds 1–6 · finalists excluded only for the award", places: 1, standings: "audience", confirm: "Confirm Audience Champion" },
};

function StageCard({ stage, overview, act, busy }: { stage: StageKey } & Pick<TabProps, "overview" | "act" | "busy">) {
  const info = STAGE_INFO[stage];
  const ranked = overview.standings[info.standings];
  const tie = stage === "top5" ? null : cutoffTie(ranked, info.places);
  const confirmed = overview.qualifications.filter((row) => row.stage === stage);
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const tiedIds = new Set(tie?.tied.map((entry) => entry.teamId));
  // Long lists (prelim, audience) only need the top of the table plus anyone in a tie.
  const visible = ranked.filter((entry, index) => index < Math.max(info.places + 5, 8) || tiedIds.has(entry.teamId));

  async function confirm() {
    const result = await act({ action: "qualify", stage, selectedTeamIds: tie ? picks : undefined, note }, tie ? "Game Jury ruling recorded." : `${info.title} confirmed.`) as { needsRuling?: boolean } | undefined;
    if (result?.needsRuling) window.alert("Scores changed and there is now a tie at the cutoff. Choose the teams that go through and record the ruling.");
    else if (result) { setPicks([]); setNote(""); }
  }

  return (
    <Card eyebrow={info.eyebrow} title={info.title} action={confirmed.length ? <span className="flex items-center gap-1.5 rounded-full bg-[#e3f2ee] px-3 py-1 text-xs font-semibold text-[#0b605c]"><CheckCircle2 size={14} /> Confirmed</span> : undefined}>
      {confirmed.length > 0 && (
        <div className="mb-4 rounded-xl bg-[#f4f8f6] p-3 text-sm">
          <p className="font-semibold text-slate-800">{confirmed.map((row) => stage === "final" ? `${row.rank === 1 ? "Winner" : "Runner-up"}: ${row.name}` : `#${row.rank} ${row.name} (${row.score})`).join(" · ")}</p>
          {confirmed[0].rulingNote && <p className="mt-1 flex gap-1.5 text-xs text-slate-600"><Gavel size={13} className="mt-0.5 shrink-0" /> Jury ruling: {confirmed[0].rulingNote}</p>}
        </div>
      )}
      {ranked.length === 0 ? <p className="text-sm text-slate-500">No scores yet.</p> : (
        <table className="w-full text-left text-sm">
          <tbody>
            {visible.map((entry, index) => {
              const isTied = tiedIds.has(entry.teamId);
              return (
                <tr key={entry.teamId} className={(index === info.places ? "border-t-2 border-dashed border-[#0e6a68] " : "border-t border-slate-100 ") + (isTied ? "bg-amber-50" : "")}>
                  <td className="w-10 py-1.5 font-mono text-slate-500">{entry.rank}</td>
                  <td className="font-medium">{entry.name}</td>
                  <td className="text-right font-mono">{entry.score}</td>
                  <td className="w-24 text-right">{isTied && <label className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><input type="checkbox" checked={picks.includes(entry.teamId)} onChange={(event) => setPicks((current) => event.target.checked ? [...current, entry.teamId] : current.filter((pick) => pick !== entry.teamId))} /> through</label>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tie && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Tie at the cutoff: {tie.tied.length} teams on {tie.tied[0].score} for {tie.slots} place{tie.slots > 1 ? "s" : ""}.</p>
          <p className="mt-1">Tied teams keep the same rank on the board. Record the Master&apos;s sudden-death ruling and tick {tie.slots} team{tie.slots > 1 ? "s" : ""} to advance.</p>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Sudden-death ruling, e.g. 'Paddle tiebreak won'" className={inputClass + " mt-2 w-full"} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn variant="primary" disabled={busy || ranked.length === 0 || (tie ? picks.length !== tie.slots || !note.trim() : false)} onClick={confirm}>{tie ? <><Gavel size={14} /> Record ruling &amp; confirm</> : confirmed.length ? "Re-confirm" : info.confirm}</Btn>
        <span className="text-xs text-slate-500">{stage === "top5" ? "All teams tied at rank five advance. This locks once Round 4 opens." : stage === "top2" ? "Locks once Round 5 opens." : "Shown on the projector from the Awards controls."}</span>
      </div>
      {stage === "audience" && <div className="mt-3 flex flex-wrap gap-2"><Btn disabled={busy} onClick={() => act({ action: "publish-audience", roundId: "round-4" }, "Audience Team Top 5 is now on the display.")}>Show Audience Top 5 after R4</Btn><Btn disabled={busy} onClick={() => act({ action: "publish-audience", roundId: "round-6" }, "Audience Team final Top 5 is now on the display.")}>Show Audience final Top 5</Btn></div>}
    </Card>
  );
}

export function ResultsTab({ overview, act, busy }: TabProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {(Object.keys(STAGE_INFO) as StageKey[]).map((stage) => <StageCard key={stage} stage={stage} overview={overview} act={act} busy={busy} />)}
    </div>
  );
}
