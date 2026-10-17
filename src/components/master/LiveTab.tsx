"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, HardHat, Info, Lightbulb, Mic, Pause, Play, Plus, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { StateBadge } from "@/components/ui/StateBadge";
import { askReason, formatSeconds, parseLetters, parsePoints, time } from "@/lib/format";
import { debateSegment } from "@/lib/game/segments";
import { cn } from "@/lib/utils";
import { RevealControls } from "./ProjectorTab";
import type { Round, TabProps } from "./types";

/** What the publish button says for a qualifier round: every publish updates the projector's leaderboard. */
function publishLabel(round: Round) {
  return round.state === "revealed" ? "Republish correction" : "Publish Top 10";
}

export function LiveTab({ overview, act, busy, serverOffset }: TabProps) {
  const nextDraft = overview.rounds.find((round) => round.state === "draft");
  const current = overview.rounds.find((round) => round.id === overview.currentRoundId);
  // Default to the round that needs attention: the running/unpublished one, else the next draft.
  // A practice round that has been scored is as good as done: move on to Round 1.
  const done = (candidate: Round) => candidate.state === "revealed" || (candidate.phase === "trial" && candidate.state === "scored");
  const focus = current && !done(current) ? current : nextDraft ?? current;
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
  const top2 = new Set(overview.qualifications.filter((row) => row.stage === "top2").map((row) => row.teamId));
  const official = (teamId: string) => round.phase === "prelim" || top2.has(teamId);
  const stageRound = round.phase === "final";
  const practice = round.phase === "trial";
  const stageScored = overview.rounds.filter((candidate) => candidate.phase === "final").every((candidate) => candidate.state === "scored" || candidate.state === "revealed");
  const remaining = round.state === "paused" ? round.pausedRemainingMs ?? 0 : round.state === "open" && round.closesAt ? Date.parse(round.closesAt) - (tick + serverOffset) : 0;
  const control = (action: string, extra: Record<string, unknown> = {}, success?: string) => act({ action: "round-control", control: action, roundId: round.id, ...extra }, success);
  const scores = overview.scoreLines.filter((line) => line.roundId === round.id);

  async function emergency(action: "pause" | "resume" | "extend") {
    let seconds: number | undefined;
    if (action === "extend") {
      const raw = window.prompt(round.state === "closed" ? "Reopen for how many seconds? (10–600)" : "Add how many seconds? (10–600)", "60");
      if (raw === null) return;
      seconds = Number(raw.trim());
      if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) { window.alert("Enter a whole number of seconds from 10 to 600, for example 60."); return; }
    }
    const reason = askReason(action === "extend" ? (round.state === "closed" ? "reopening the round" : "extending the timer") : `${action === "pause" ? "pausing" : "resuming"} the round`);
    if (reason) await control(action, { seconds, reason }, action === "extend" ? (round.state === "closed" ? "Round reopened." : "Timer extended.") : `Round ${action}d.`);
  }

  async function recordManual() {
    const answer = window.prompt("Enter the paper-answer team name exactly as listed:");
    if (!answer?.trim()) return;
    const team = activeTeams.find((candidate) => candidate.name.toLowerCase() === answer.trim().toLowerCase());
    if (!team) { window.alert("That active team was not found. Use its exact team name."); return; }
    const raw = window.prompt("Enter the three ranked option letters, best first (for example: A C F):");
    if (!raw) return;
    const choices = parseLetters(raw);
    if (!choices) { window.alert("Enter exactly three different option letters, for example A C F."); return; }
    const reason = askReason("accepting this paper answer");
    if (!reason) return;
    await act({ action: "record-manual-submission", roundId: round.id, teamId: team.id, choices, reason }, `Paper answer recorded for ${team.name}: ${choices.join(" › ")}.`);
  }

  async function correctScore(team: { id: string; name: string }, currentPoints: number) {
    const raw = window.prompt(`Corrected points for ${team.name}, 0–100 (leave blank to clear the override):`, String(currentPoints));
    if (raw === null) return;
    const points = parsePoints(raw);
    if (points === "invalid") { window.alert("Enter a whole number from 0 to 100, or leave it blank to clear the override."); return; }
    const reason = askReason("this score correction");
    if (reason) await act({ action: "override-score", roundId: round.id, teamId: team.id, points, reason }, "Score corrected. Click Republish correction to update the leaderboard.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {overview.rounds.map((candidate) => (
          <button key={candidate.id} type="button" onClick={() => setSelectedId(candidate.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", candidate.id === round.id ? "border-teal-mid bg-white text-ink shadow-sm" : "border-rule bg-white/60 text-muted hover:bg-white")}>
            {candidate.title.split(" · ")[0]}<StateBadge state={candidate.state} />
          </button>
        ))}
      </div>

      <Card eyebrow={`${practice ? "Practice · never counts, no leaderboard" : round.phase === "prelim" ? "Qualifier · all teams official" : "Top 2 stage round · every other team plays for the hamper"} · fixed 40/30/20 · ${Math.round(round.durationSeconds / 60 * 10) / 10} min`} title={round.title} action={<StateBadge state={round.state} />}>
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div>
            {!round.scenario && <Notice tone="warning" className="mb-4">This question has no content yet. Load it in the Questions tab.</Notice>}
            {round.scenario && <p className="mb-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted">{round.scenario}</p>}
            {(round.leadHat || round.principle) && (
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {round.leadHat && <span className="chip flex items-center gap-1.5 bg-panel-teal px-2.5 py-1 font-semibold text-teal-base"><HardHat size={12} /> Lead hat: {round.leadHat}</span>}
                {round.principle && <span className="chip flex items-center gap-1.5 bg-surface-sunk px-2.5 py-1 text-muted" title="Shown on the projector only after Boardroom #1"><Lightbulb size={12} /> {round.principle}</span>}
              </div>
            )}
            {round.followUp && <div className="tile mb-4 flex gap-2 border border-accent/30 bg-panel-orange p-3 text-sm text-ink"><Mic size={15} className="mt-0.5 shrink-0 text-accent-deep" /><p><strong>Emcee follow-up after the lock:</strong> {round.followUp}</p></div>}
            <div className="flex flex-wrap gap-2">
              {round.state === "draft" && <Button variant="primary" disabled={busy} onClick={() => control("open", {}, "Round opened. The projector now shows the question.")}><Play size={14} /> Open round</Button>}
              {round.state === "open" && <Button disabled={busy} onClick={() => emergency("pause")}><Pause size={14} /> Pause</Button>}
              {round.state === "paused" && <Button variant="outline" disabled={busy} onClick={() => emergency("resume")}><Play size={14} /> Resume</Button>}
              {(round.state === "open" || round.state === "paused" || round.state === "closed") && <Button disabled={busy} onClick={() => emergency("extend")}><Plus size={14} /> {round.state === "closed" ? "Reopen" : "Extend"}</Button>}
              {(round.state === "open" || round.state === "paused") && <Button variant="danger" disabled={busy} onClick={() => window.confirm("Close the round now? Teams can no longer submit.") && control("close", {}, "Round closed. Next: Score round.")}><Square size={14} /> Close now</Button>}
              {round.state === "closed" && <Button variant="primary" disabled={busy} onClick={() => act({ action: "score-round", roundId: round.id }, stageRound ? "Scored. Its reveal is held until after Round 6." : "Scored. Review below, reveal on the projector, then publish to update the leaderboard.")}>Score round</Button>}
              {(round.state === "scored" || round.state === "revealed") && <>
                <Button disabled={busy} onClick={() => act({ action: "score-round", roundId: round.id }, stageRound ? "Re-scored. Overrides were kept." : "Re-scored. Overrides were kept. Republish to update the leaderboard.")}>Re-score</Button>
                <Button variant="outline" disabled={busy} onClick={() => act({ action: "confirm-scores-green", roundId: round.id }, "SCORES GREEN recorded in the audit log.")}>SCORES GREEN</Button>
                {practice && round.state === "scored" && <Button variant="primary" disabled={busy} onClick={() => act({ action: "publish-round", roundId: round.id }, "Practice finished. The projector is back on the welcome screen. Open Round 1 when the room is ready.")}>Finish practice</Button>}
                {!stageRound && !practice && <Button variant="primary" disabled={busy} onClick={() => act({ action: "publish-round", roundId: round.id }, (result) => `Published. The projector now shows "${(result as { label?: string } | null)?.label ?? "the standings"}".`)}>{publishLabel(round)}</Button>}
              </>}
            </div>
            {round.state === "closed" && <p className="mt-3 flex gap-2 text-xs leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" /> Closing only stops submissions. {practice ? <>Click <strong>Score round</strong> so each phone can show what its team would have scored. Nothing counts.</> : <>Points count once you click <strong>Score round</strong>{stageRound ? "." : <>, and the projector leaderboard updates when you <strong>Publish</strong>.</>}</>}</p>}
            {practice && round.state === "scored" && <p className="mt-3 flex gap-2 text-xs leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" /> Run the reveal exactly like a real round so the room sees how it works, then click <strong>Finish practice</strong>. Nothing reaches any leaderboard or total.</p>}
            {round.state === "scored" && !stageRound && !practice && <p className="mt-3 flex gap-2 text-xs leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" /> Scores are saved but not public yet. Reveal the Boardroom Choices, then publish to put the cumulative leaderboard on the projector.</p>}
            {stageRound && (round.state === "scored" || round.state === "revealed") && (
              <Notice tone={stageScored ? "success" : "warning"} className="mt-3 text-xs leading-5">
                {stageScored
                  ? <>Both stage rounds are scored. Reveal <strong>Round 5</strong>, then <strong>Round 6</strong>. Next, confirm the winner and the hamper in <strong>Qualify &amp; awards</strong> (sudden death if tied), then run the Awards from Screen control. No stage scoreboard goes on screen: the awards are the reveal.</>
                  : <>Suspense hold: Round 5&apos;s answers and scores stay hidden. Open Round 6 now; both stage rounds are revealed after Round 6 is scored.</>}
              </Notice>
            )}
            {(round.state === "scored" || round.state === "revealed") && (!stageRound || stageScored) && <div className="mt-5"><RevealControls overview={overview} act={act} busy={busy} roundId={round.id} /></div>}
            {["open", "paused", "closed"].includes(round.state) && <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy} onClick={recordManual}>Record paper answer</Button></div>}
          </div>
          <div className={cn("tile p-5 text-white", round.state === "paused" ? "bg-warning" : round.state === "open" && remaining < 30_000 ? "bg-danger" : "bg-teal-dark")}>
            <p className="kicker flex items-center gap-1 text-white/75"><Timer size={13} /> Server timer</p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums">{round.state === "open" || round.state === "paused" ? formatSeconds(remaining) : "--:--"}</p>
            {(round.state === "open" || round.state === "paused") && <p className="mt-1 text-sm font-semibold text-white/90">{debateSegment(remaining).label}</p>}
            <p className="mt-3 text-sm text-white/85">{submissionCount} of {activeTeams.length} teams submitted</p>
            {round.closesAt && <p className="mt-1 text-xs text-white/65">Closes {time(round.closesAt)}</p>}
          </div>
        </div>
      </Card>

      {round.state !== "draft" && (
        <Card eyebrow="Who has submitted (answers stay hidden)" title="Submissions">
          {!isCurrent ? <p className="text-sm text-muted">{submissionCount} submissions. The live grid is shown for the current round only.</p> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {activeTeams.map((team) => {
                const at = submittedIds.get(team.id);
                return (
                  <div key={team.id} className={cn("chip flex items-center gap-2 border px-3 py-2 text-sm", at ? "border-success/30 bg-panel-success" : "border-rule bg-white")}>
                    {at ? <CheckCircle2 size={15} className="shrink-0 text-success" /> : <Circle size={15} className="shrink-0 text-faint" />}
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{team.name}</span>
                    {!official(team.id) && <span className="text-[10px] font-semibold uppercase text-faint">along</span>}
                    {at && <span className="font-mono text-[11px] text-muted">{time(at)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {(round.state === "scored" || round.state === "revealed") && (
        <Card eyebrow="Review before publishing · corrections are audited" title="Round scores">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="kicker text-muted"><tr><th className="py-2">Team</th><th>Track</th><th>Calculated</th><th>Override</th><th>Counts</th><th /></tr></thead>
              <tbody>
                {activeTeams.map((team) => {
                  const line = scores.find((row) => row.teamId === team.id);
                  const counts = line ? line.overridePoints ?? line.points : 0;
                  return (
                    <tr key={team.id} className="border-t border-rule">
                      <td className="py-2 font-medium text-ink">{team.name}</td>
                      <td className="text-xs text-muted">{official(team.id) ? "official" : "audience"}</td>
                      <td className="font-mono">{line ? line.points : "—"}</td>
                      <td className="font-mono text-warning" title={line?.overrideReason ?? ""}>{line?.overridePoints ?? ""}</td>
                      <td className="font-mono font-bold text-ink">{counts}</td>
                      <td className="py-1 text-right"><Button disabled={busy} onClick={() => correctScore(team, counts)}>Correct</Button></td>
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
