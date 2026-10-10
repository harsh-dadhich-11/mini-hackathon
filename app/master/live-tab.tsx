"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Pause, Play, Plus, Square, Timer } from "lucide-react";
import { RevealControls } from "./projector-tab";
import { askReason, Btn, Card, formatSeconds, StateBadge, time, type TabProps } from "./master-ui";

export function LiveTab({ overview, act, busy, serverOffset }: TabProps) {
  const nextDraft = overview.rounds.find((round) => round.state === "draft");
  const current = overview.rounds.find((round) => round.id === overview.currentRoundId);
  // Default to the round that needs attention: the running/unpublished one, else the next draft.
  const focus = current && current.state !== "revealed" ? current : nextDraft ?? current;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const round = overview.rounds.find((candidate) => candidate.id === selectedId) ?? focus ?? overview.rounds[0];
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (!round) return null;

  const isCurrent = round.id === overview.currentRoundId;
  const submittedIds = new Map(isCurrent ? overview.currentSubmissions.map((row) => [row.teamId, row.updatedAt]) : []);
  const submissionCount = overview.submissionCounts.find((row) => row.roundId === round.id)?.count ?? 0;
  const activeTeams = overview.teams.filter((team) => team.isActive);
  const top5 = new Set(overview.qualifications.filter((row) => row.stage === "top5").map((row) => row.teamId));
  const top2 = new Set(overview.qualifications.filter((row) => row.stage === "top2").map((row) => row.teamId));
  const official = (teamId: string) => round.phase === "prelim" || (round.phase === "playoff" ? top5.has(teamId) : top2.has(teamId));
  const remaining = round.state === "paused" ? round.pausedRemainingMs ?? 0 : round.state === "open" && round.closesAt ? Date.parse(round.closesAt) - (tick + serverOffset) : 0;
  const control = (action: string, extra: Record<string, unknown> = {}, success?: string) => act({ action: "round-control", control: action, roundId: round.id, ...extra }, success);

  async function emergency(action: "pause" | "resume" | "extend") {
    let seconds: number | undefined;
    if (action === "extend") {
      seconds = Number(window.prompt(round.state === "closed" ? "Reopen for how many seconds?" : "Add how many seconds?", "60"));
      if (!seconds) return;
    }
    const reason = askReason(action === "extend" ? (round.state === "closed" ? "reopening the round" : "extending the timer") : `${action === "pause" ? "pausing" : "resuming"} the round`);
    if (reason) await control(action, { seconds, reason }, `Round ${action === "extend" ? "timer extended" : action + "d"}.`);
  }

  const scores = overview.scoreLines.filter((line) => line.roundId === round.id);

  async function recordManual(source: "paper" | "paddle") {
    const answer = window.prompt(`Enter ${source === "paper" ? "the paper-answer" : "the finalist paddle"} team name exactly as listed:`);
    if (!answer?.trim()) return;
    const team = activeTeams.find((candidate) => candidate.name.toLowerCase() === answer.trim().toLowerCase());
    if (!team) { window.alert("That active team was not found. Use its exact team name."); return; }
    const choices = window.prompt("Enter the three ranked option letters, separated by commas (for example: A,C,F):");
    if (!choices) return;
    const reason = askReason(source === "paper" ? "accepting this paper answer" : "recording this stage paddle");
    if (!reason) return;
    await act({ action: "record-manual-submission", source, roundId: round.id, teamId: team.id, choices: choices.split(",").map((choice) => choice.trim().toUpperCase()).filter(Boolean), reason }, `${source === "paper" ? "Paper answer" : "Paddle choice"} recorded for ${team.name}.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {overview.rounds.map((candidate) => <button key={candidate.id} onClick={() => setSelectedId(candidate.id)} className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold " + (candidate.id === round.id ? "border-[#0e6a68] bg-white shadow-sm" : "border-slate-200 bg-white/60 text-slate-600 hover:bg-white")}>{candidate.title.split(" · ")[0]}<StateBadge state={candidate.state} /></button>)}
      </div>

      <Card eyebrow={`${round.phase === "prelim" ? "All teams official" : round.phase === "playoff" ? "Top 5 official · all others Audience Team" : "Top 2 stage round · all others Audience Team"} · fixed 40/30/20 · ${Math.round(round.durationSeconds / 60 * 10) / 10} min`} title={round.title} action={<StateBadge state={round.state} />}>
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div>
            {!round.scenario && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">This question has no content yet. Load it in the Questions tab.</p>}
            {round.scenario && <p className="mb-4 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{round.scenario}</p>}
            <div className="flex flex-wrap gap-2">
              {round.state === "draft" && <Btn variant="primary" disabled={busy} onClick={() => control("open", {}, "Round opened. The projector now shows the question.")}><Play size={14} /> Open round</Btn>}
              {round.state === "open" && <Btn disabled={busy} onClick={() => emergency("pause")}><Pause size={14} /> Pause</Btn>}
              {round.state === "paused" && <Btn variant="outline" disabled={busy} onClick={() => emergency("resume")}><Play size={14} /> Resume</Btn>}
              {(round.state === "open" || round.state === "paused" || round.state === "closed") && <Btn disabled={busy} onClick={() => emergency("extend")}><Plus size={14} /> {round.state === "closed" ? "Reopen" : "Extend"}</Btn>}
              {(round.state === "open" || round.state === "paused") && <Btn variant="danger" disabled={busy} onClick={() => window.confirm("Close the round now? Teams can no longer submit.") && control("close", {}, "Round closed.")}><Square size={14} /> Close now</Btn>}
              {round.state === "closed" && <Btn variant="primary" disabled={busy} onClick={() => act({ action: "score-round", roundId: round.id }, "Scored. Review below, reveal on the projector, then publish.")}>Score round</Btn>}
              {(round.state === "scored" || round.state === "revealed") && <>
                <Btn disabled={busy} onClick={() => act({ action: "score-round", roundId: round.id }, "Re-scored. Overrides were kept.")}>Re-score</Btn>
                <Btn variant="outline" disabled={busy} onClick={() => act({ action: "confirm-scores-green", roundId: round.id }, "SCORES GREEN recorded in the audit log.")}>SCORES GREEN</Btn>
                <Btn variant="primary" disabled={busy} onClick={() => act({ action: "publish-round", roundId: round.id }, "Round marked revealed; any scheduled screen result is now ready.")}>{round.state === "revealed" ? "Republish correction" : round.id === "round-1" || round.id === "round-2" ? "Publish Top 10" : round.id === "round-5" ? "Publish stage scoreboard" : round.id === "round-6" ? "Publish final scoreboard" : "Mark revealed"}</Btn>
              </>}
            </div>
            {(round.state === "scored" || round.state === "revealed") && <div className="mt-5"><RevealControls overview={overview} act={act} busy={busy} roundId={round.id} /></div>}
            {["open", "paused", "closed"].includes(round.state) && <div className="mt-4 flex flex-wrap gap-2"><Btn disabled={busy} onClick={() => recordManual("paper")}>Record paper answer</Btn>{round.phase === "final" && <Btn variant="outline" disabled={busy} onClick={() => recordManual("paddle")}>Enter Top 2 paddle</Btn>}</div>}
          </div>
          <div className={"rounded-2xl p-5 text-white " + (round.state === "paused" ? "bg-amber-600" : round.state === "open" && remaining < 30_000 ? "bg-rose-700" : "bg-[#083f41]")}>
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70"><Timer size={13} /> Server timer</p>
            <p className="mt-1 font-mono text-4xl font-bold">{round.state === "open" || round.state === "paused" ? formatSeconds(remaining) : "--:--"}</p>
            <p className="mt-3 text-sm text-white/80">{submissionCount} of {activeTeams.length} teams submitted</p>
            {round.closesAt && <p className="mt-1 text-xs text-white/60">Closes {time(round.closesAt)}</p>}
          </div>
        </div>
      </Card>

      {round.state !== "draft" && (
        <Card eyebrow="Who has submitted (answers stay hidden)" title="Submissions">
          {!isCurrent ? <p className="text-sm text-slate-500">{submissionCount} submissions. The live grid is shown for the current round only.</p> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {activeTeams.map((team) => {
                const at = submittedIds.get(team.id);
                return <div key={team.id} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " + (at ? "border-emerald-200 bg-emerald-50" : "border-slate-200")}>{at ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> : <Circle size={15} className="shrink-0 text-slate-300" />}<span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>{!official(team.id) && <span className="text-[10px] font-semibold uppercase text-slate-400">along</span>}{at && <span className="font-mono text-[11px] text-slate-500">{time(at)}</span>}</div>;
              })}
            </div>
          )}
        </Card>
      )}

      {(round.state === "scored" || round.state === "revealed") && (
        <Card eyebrow="Review before publishing · corrections are audited" title="Round scores">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Team</th><th>Track</th><th>Calculated</th><th>Override</th><th>Counts</th><th /></tr></thead>
              <tbody>
                {activeTeams.map((team) => {
                  const line = scores.find((row) => row.teamId === team.id);
                  const track = official(team.id) ? "official" : "audience";
                  return (
                    <tr key={team.id} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{team.name}</td>
                      <td className="text-xs text-slate-500">{track}</td>
                      <td className="font-mono">{line ? line.points : "—"}</td>
                      <td className="font-mono text-amber-700" title={line?.overrideReason ?? ""}>{line?.overridePoints ?? ""}</td>
                      <td className="font-mono font-bold">{line ? line.overridePoints ?? line.points : 0}</td>
                      <td className="text-right">
                        <Btn disabled={busy} onClick={async () => {
                          const value = window.prompt(`Corrected points for ${team.name} (blank clears the override):`, String(line?.overridePoints ?? line?.points ?? 0));
                          if (value === null) return;
                          const reason = askReason("this score correction");
                          if (reason) await act({ action: "override-score", roundId: round.id, teamId: team.id, points: value.trim() === "" ? null : Number(value), reason }, "Score corrected. Publish again to update the leaderboard.");
                        }}>Correct</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
