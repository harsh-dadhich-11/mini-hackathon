"use client";

import { useState } from "react";
import { Copy, Link2, MonitorUp, Music, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { time } from "@/lib/format";
import type { Act, Display, Overview, TabProps } from "./types";

function isShowing(current: Display, next: Display) {
  if (current.mode === "standings" && next.mode === "standings") return true;
  return JSON.stringify(current) === JSON.stringify(next);
}

function Step({ overview, act, busy, display, disabled, children }: { overview: Overview; act: Act; busy: boolean; display: Display; disabled?: boolean; children: React.ReactNode }) {
  const active = isShowing(overview.display, display);
  return <Button variant={active ? "secondary" : "quiet"} disabled={busy || disabled} onClick={() => act({ action: "display", display })}>{children}</Button>;
}

/** Boardroom Choices reveal for one scored round: scenario, then #3, #2, #1 (each after a drumroll), then the principle. */
export function RevealControls({ overview, act, busy, roundId }: { overview: Overview; act: Act; busy: boolean; roundId: string }) {
  const props = { overview, act, busy };
  const round = overview.rounds.find((candidate) => candidate.id === roundId);
  const held = round?.phase === "final" && !overview.rounds.filter((candidate) => candidate.phase === "final").every((candidate) => candidate.state === "scored" || candidate.state === "revealed");
  return (
    <div className="tile bg-panel-teal p-3">
      <p className="kicker mb-2 flex items-center gap-1.5 text-teal-base"><MonitorUp size={14} /> Projector reveal</p>
      <div className="flex flex-wrap gap-2">
        <Step {...props} disabled={held} display={{ mode: "reveal", roundId, step: 0 }}>Scenario</Step>
        <Step {...props} disabled={held} display={{ mode: "reveal", roundId, step: 1 }}>Reveal #3</Step>
        <Step {...props} disabled={held} display={{ mode: "reveal", roundId, step: 2 }}>Reveal #2</Step>
        <Step {...props} disabled={held} display={{ mode: "reveal", roundId, step: 3 }}>Reveal #1</Step>
        <Step {...props} disabled={held} display={{ mode: "reveal", roundId, step: 4 }}>Principle &amp; why not the others</Step>
        {round?.phase === "prelim" && <Step {...props} display={{ mode: "standings" }}>Last published standings</Step>}
      </div>
      <p className="mt-2 text-xs text-muted">{held ? "Held until both stage rounds are scored." : "#3, #2 and #1 each land after a two-second drumroll."}</p>
    </div>
  );
}

/** Steps for the sudden death on screen: question, the answer, then every guess. */
export function SuddenDeathSteps({ overview, act, busy, suddenDeathId, closed }: { overview: Overview; act: Act; busy: boolean; suddenDeathId: string; closed: boolean }) {
  const props = { overview, act, busy };
  return (
    <div className="flex flex-wrap gap-2">
      <Step {...props} display={{ mode: "sudden-death", id: suddenDeathId, step: 0 }}>Question</Step>
      <Step {...props} disabled={!closed} display={{ mode: "sudden-death", id: suddenDeathId, step: 1 }}>Reveal answer</Step>
      <Step {...props} disabled={!closed} display={{ mode: "sudden-death", id: suddenDeathId, step: 2 }}>Reveal picks</Step>
    </div>
  );
}

/** The emcee's switches for the projector's soundtrack. The projector's own button covers its local mute. */
function SoundCard({ overview, act, busy }: Pick<TabProps, "overview" | "act" | "busy">) {
  const { music, sfx } = overview.audio;
  const set = (next: { music: boolean; sfx: boolean }) => act({ action: "set-audio", ...next });
  return (
    <Card eyebrow="Projector soundtrack · follows within two seconds" title="Music & effects">
      <div className="flex flex-wrap gap-2">
        <Button variant={music ? "secondary" : "quiet"} disabled={busy} onClick={() => set({ music: !music, sfx })}><Music size={14} /> Music {music ? "on" : "off"}</Button>
        <Button variant={sfx ? "secondary" : "quiet"} disabled={busy} onClick={() => set({ music, sfx: !sfx })}>{sfx ? <Volume2 size={14} /> : <VolumeX size={14} />} Effects {sfx ? "on" : "off"}</Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">Music: lobby bed, the quiz bed during the debate, tension in the last minute and a heartbeat in sudden death. Effects: ticks in the last 10 s, the time-up buzzer, drumrolls and stings at each reveal, and the winner fanfare. Turn the music off while the emcee talks to the finalists. The projector must be clicked once to allow sound (it shows a &ldquo;Click to enable sound&rdquo; button); press M there to mute just that screen. Drop MP3s into <code>public/audio/</code> to replace any built-in cue.</p>
    </Card>
  );
}

function describe(display: Display, overview: Overview) {
  const title = (roundId: string) => overview.rounds.find((round) => round.id === roundId)?.title ?? roundId;
  switch (display.mode) {
    case "standings": return "Published standings";
    case "question": return `Question · ${title(display.roundId)}`;
    case "reveal": return `Boardroom Choices · ${title(display.roundId)} · step ${display.step}/4`;
    case "qualifiers": return `Top 2 reveal · ${display.step} shown`;
    case "awards": return `Awards · step ${display.step}/3`;
    case "sudden-death": return `Sudden death · step ${display.step}/2`;
    default: return "Welcome screen";
  }
}

function ProjectorLinks({ overview, act, busy }: Pick<TabProps, "overview" | "act" | "busy">) {
  const [created, setCreated] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const live = overview.displayLinks.filter((link) => !link.revokedAt && link.expiresAt > overview.serverNow);

  async function create() {
    const label = window.prompt("Name this projector link (for example: Main stage laptop):", "Main stage laptop");
    if (label === null) return;
    const result = await act({ action: "create-display-link", label }, "Projector link created. Open it on the stage laptop.") as { key: string; label: string } | undefined;
    if (result) { setCreated({ url: `${window.location.origin}/api/display/connect?key=${encodeURIComponent(result.key)}`, label: result.label }); setCopied(false); }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.url).then(() => setCopied(true), () => setCopied(false));
  }

  return (
    <Card eyebrow="View-only · no Master sign-in on the stage laptop" title="Projector links" action={<Button variant="primary" disabled={busy} onClick={create}><Link2 size={14} /> Create projector link</Button>}>
      <p className="mb-4 text-sm leading-6 text-muted">A projector link opens the display on any computer without signing in, and can only show what the audience is meant to see. Signing out of this console no longer affects the big screen. Links last 72 hours and can be revoked at any time.</p>
      {created && (
        <Notice tone="success" className="mb-4">
          <p className="font-semibold">Link for &ldquo;{created.label}&rdquo;, shown once. Open it on the stage laptop, then press F11 for full screen.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="chip min-w-0 flex-1 truncate bg-white px-2 py-1.5 font-mono text-xs text-ink">{created.url}</code>
            <Button variant="outline" onClick={copy}><Copy size={13} /> {copied ? "Copied" : "Copy"}</Button>
            <a href={created.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-base hover:underline">Open here ↗</a>
          </div>
        </Notice>
      )}
      {live.length ? (
        <ul className="divide-y divide-rule text-sm">
          {live.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span><strong className="text-ink">{link.label}</strong> <span className="text-muted">· created {time(link.createdAt)} by {link.createdBy} · expires {new Date(link.expiresAt).toLocaleString()}</span></span>
              <Button variant="danger" disabled={busy} onClick={() => window.confirm(`Revoke "${link.label}"? That screen stops updating immediately.`) && act({ action: "revoke-display-link", id: link.id }, "Projector link revoked.")}>Revoke</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No live projector links.</p>}
    </Card>
  );
}

export function ProjectorTab({ overview, act, busy }: TabProps) {
  const props = { overview, act, busy };
  const started = overview.rounds.filter((round) => round.state !== "draft");
  const reviewable = started.filter((round) => round.state === "scored" || round.state === "revealed");
  const stageCount = (stage: string) => overview.qualifications.filter((row) => row.stage === stage).length;
  const audienceReady = stageCount("audience") > 0;

  return (
    <div className="space-y-5">
      <Card eyebrow="On the projector now" title={describe(overview.display, overview)}>
        <div className="flex flex-wrap gap-2">
          <Step {...props} display={{ mode: "idle" }}>Welcome screen</Step>
          <Step {...props} display={{ mode: "standings" }}>Last published standings</Step>
        </div>
        <p className="mt-3 text-xs text-muted">&ldquo;Last published standings&rdquo; shows the newest board from a Publish button. Confirming the Top 2, the winner or the hamper never changes the screen; reveal those with the controls below.</p>
      </Card>

      <SoundCard {...props} />

      <ProjectorLinks {...props} />

      <Card eyebrow="Shown automatically when a round opens" title="Questions">
        {started.length ? <div className="flex flex-wrap gap-2">{started.map((round) => <Step key={round.id} {...props} display={{ mode: "question", roundId: round.id }}>{round.title.split(" · ")[0]}</Step>)}</div> : <p className="text-sm text-muted">No round has been opened yet.</p>}
      </Card>

      {overview.suddenDeaths[0] && (
        <Card eyebrow={`Latest sudden death · ${overview.suddenDeaths[0].questionKey}`} title="Sudden death">
          <SuddenDeathSteps {...props} suddenDeathId={overview.suddenDeaths[0].id} closed={overview.suddenDeaths[0].state !== "open"} />
          <p className="mt-3 text-xs text-muted">Run sudden deaths from Qualify &amp; awards.</p>
        </Card>
      )}

      <Card eyebrow="After scoring · Rounds 5–6 wait until both are scored" title="Boardroom Choices reveal">
        {reviewable.length ? <div className="space-y-3">{reviewable.map((round) => <div key={round.id}><p className="mb-1 text-sm font-semibold text-ink">{round.title}</p><RevealControls {...props} roundId={round.id} /></div>)}</div> : <p className="text-sm text-muted">Score a round to reveal its Boardroom Choices.</p>}
      </Card>

      <Card eyebrow="Revealed from the bottom up, each after a drumroll" title="Top 2 reveal">
        <div className="flex flex-wrap items-center gap-2">
          {stageCount("top2") ? Array.from({ length: stageCount("top2") + 1 }, (_, step) => <Step key={step} {...props} display={{ mode: "qualifiers", stage: "top2", step }}>{step === 0 ? "Intro" : `Reveal #${stageCount("top2") - step + 1}`}</Step>) : <span className="text-sm text-muted">Confirm the Top 2 in Qualify &amp; awards first.</span>}
        </div>
      </Card>

      <Card eyebrow="Closing ceremony" title="Awards">
        {stageCount("final") ? <>
          <div className="flex flex-wrap gap-2">
            <Step {...props} display={{ mode: "awards", step: 0 }}>Intro</Step>
            <Step {...props} display={{ mode: "awards", step: 1 }} disabled={!audienceReady}>Chocolate hamper</Step>
            <Step {...props} display={{ mode: "awards", step: 2 }} disabled={!audienceReady}>Runner-up</Step>
            <Step {...props} display={{ mode: "awards", step: 3 }} disabled={!audienceReady}>Winner</Step>
          </div>
          {!audienceReady && <p className="mt-3 text-xs text-warning">Confirm the chocolate hamper in Qualify &amp; awards before starting the awards reveal.</p>}
        </> : <p className="text-sm text-muted">Confirm the winner in Qualify &amp; awards first.</p>}
      </Card>
    </div>
  );
}
