"use client";

import { MonitorUp } from "lucide-react";
import { Btn, Card, type Act, type Display, type Overview, type TabProps } from "./master-ui";

function isShowing(current: Display, next: Display) {
  return JSON.stringify(current) === JSON.stringify(next);
}

function Step({ overview, act, busy, display, children }: { overview: Overview; act: Act; busy: boolean; display: Display; children: React.ReactNode }) {
  const active = isShowing(overview.display, display);
  return <Btn variant={active ? "primary" : "quiet"} disabled={busy} onClick={() => act({ action: "display", display })}>{children}</Btn>;
}

/** Boardroom Choices reveal for one scored round: scenario, then #3, #2, #1 with evidence. */
export function RevealControls({ overview, act, busy, roundId }: { overview: Overview; act: Act; busy: boolean; roundId: string }) {
  const props = { overview, act, busy };
  return (
    <div className="rounded-xl bg-[#f4f8f6] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#0e6a68]"><MonitorUp size={14} /> Projector reveal</p>
      <div className="flex flex-wrap gap-2">
        <Step {...props} display={{ mode: "reveal", roundId, step: 0 }}>Scenario</Step>
        <Step {...props} display={{ mode: "reveal", roundId, step: 1 }}>Reveal #3</Step>
        <Step {...props} display={{ mode: "reveal", roundId, step: 2 }}>Reveal #2</Step>
        <Step {...props} display={{ mode: "reveal", roundId, step: 3 }}>Reveal #1</Step>
        <Step {...props} display={{ mode: "standings" }}>Standings</Step>
      </div>
    </div>
  );
}

function describe(display: Display, overview: Overview) {
  const title = (roundId: string) => overview.rounds.find((round) => round.id === roundId)?.title ?? roundId;
  switch (display.mode) {
    case "standings": return "Latest published standings";
    case "question": return `Question · ${title(display.roundId)}`;
    case "reveal": return `Boardroom Choices · ${title(display.roundId)} · step ${display.step}/3`;
    case "qualifiers": return `${display.stage === "top5" ? "Top 5" : "Top 2"} reveal · ${display.step} shown`;
    case "awards": return `Awards · step ${display.step}/3`;
    default: return "Welcome screen";
  }
}

export function ProjectorTab({ overview, act, busy }: TabProps) {
  const props = { overview, act, busy };
  const started = overview.rounds.filter((round) => round.state !== "draft");
  const reviewable = started.filter((round) => round.state === "scored" || round.state === "revealed");
  const stageCount = (stage: string) => overview.qualifications.filter((row) => row.stage === stage).length;

  return (
    <div className="space-y-5">
      <Card eyebrow="Versioned, display-only screen state" title={describe(overview.display, overview)} action={<a href="/display" target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#0e6a68] hover:underline">Open display-only view ↗</a>}>
        <div className="flex flex-wrap gap-2">
          <Step {...props} display={{ mode: "idle" }}>Welcome screen</Step>
          <Step {...props} display={{ mode: "standings" }}>Standings</Step>
        </div>
      </Card>

      <Card eyebrow="Shown automatically when a round opens" title="Questions">
        {started.length ? <div className="flex flex-wrap gap-2">{started.map((round) => <Step key={round.id} {...props} display={{ mode: "question", roundId: round.id }}>{round.title.split(" · ")[0]}</Step>)}</div> : <p className="text-sm text-slate-500">No round has been opened yet.</p>}
      </Card>

      <Card eyebrow="After scoring, before publishing" title="Boardroom Choices reveal">
        {reviewable.length ? <div className="space-y-3">{reviewable.map((round) => <div key={round.id}><p className="mb-1 text-sm font-semibold text-slate-700">{round.title}</p><RevealControls {...props} roundId={round.id} /></div>)}</div> : <p className="text-sm text-slate-500">Score a round to reveal its Boardroom Choices.</p>}
      </Card>

      <Card eyebrow="Revealed from the bottom up" title="Qualifier reveals">
        {(["top5", "top2"] as const).map((stage) => {
          const count = stageCount(stage);
          return (
            <div key={stage} className="mb-3 flex flex-wrap items-center gap-2">
              <span className="w-16 text-sm font-semibold text-slate-700">{stage === "top5" ? "Top 5" : "Top 2"}</span>
              {count ? Array.from({ length: count + 1 }, (_, step) => <Step key={step} {...props} display={{ mode: "qualifiers", stage, step }}>{step === 0 ? "Intro" : `Reveal #${count - step + 1}`}</Step>) : <span className="text-sm text-slate-500">Confirm in Qualify &amp; awards first.</span>}
            </div>
          );
        })}
      </Card>

      <Card eyebrow="Closing ceremony" title="Awards">
        {stageCount("final") ? <div className="flex flex-wrap gap-2">
          <Step {...props} display={{ mode: "awards", step: 0 }}>Intro</Step>
          <Step {...props} display={{ mode: "awards", step: 1 }}>Audience Champion</Step>
          <Step {...props} display={{ mode: "awards", step: 2 }}>Runner-up</Step>
          <Step {...props} display={{ mode: "awards", step: 3 }}>Winner</Step>
        </div> : <p className="text-sm text-slate-500">Confirm the winner in Qualify &amp; awards first.</p>}
      </Card>
    </div>
  );
}
