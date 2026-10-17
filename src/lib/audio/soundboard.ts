// The projector's soundboard: one AudioContext, a music bus and an effects bus. Browser only.
// Each cue plays /audio/<cue>.mp3 when that file exists, otherwise its built-in synth version (./synth.ts).
// Browsers block sound until someone clicks the page, so the projector shows an "Enable sound" button until `unlock()`.

import { LOOPS, ONE_SHOTS, type LoopCue, type OneShotCue } from "./synth";

export type { LoopCue, OneShotCue };
export type Cue = LoopCue | OneShotCue;

export const CUES = [...Object.keys(LOOPS), ...Object.keys(ONE_SHOTS)] as Cue[];

const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.9;
const MUTE_KEY = "boardroom:projector-muted";
/** Bars are scheduled this far ahead, so a briefly busy main thread never leaves a gap. */
const LOOKAHEAD_S = 1.2;
const SCHEDULER_MS = 200;

type Snapshot = { unlocked: boolean; muted: boolean };
type Playing = { cue: LoopCue; stop: (fadeSeconds: number) => void };

function readMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

function writeMuted(muted: boolean) {
  try { window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private window: mute lasts for this visit */ }
}

class Soundboard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private samples = new Map<Cue, AudioBuffer | null>();
  private preloading: Promise<void> | null = null;
  private current: Playing | null = null;
  private wanted: LoopCue | null = null;
  private enabled = { music: true, sfx: true };
  private shots = new Set<{ cue: OneShotCue; stop: () => void }>();
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { unlocked: false, muted: false };
  private started = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => SERVER_SNAPSHOT;

  private publish(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    const muted = readMuted();
    this.master.gain.value = muted ? 0 : 1;
    this.music.gain.value = this.enabled.music ? MUSIC_LEVEL : 0;
    this.sfx.gain.value = this.enabled.sfx ? SFX_LEVEL : 0;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(ctx.destination);
    ctx.onstatechange = () => this.onRunning();
    this.publish({ muted, unlocked: ctx.state === "running" });
    return ctx;
  }

  private onRunning() {
    const running = this.ctx?.state === "running";
    if (running !== this.snapshot.unlocked) this.publish({ unlocked: running });
    if (running && !this.started) {
      this.started = true;
      void this.preload();
      this.applyLoop();
    }
  }

  /** Called on page load: some browsers already allow sound for a page the operator has used before. */
  init() {
    this.ensure();
    this.onRunning();
  }

  /** Call from a click or key press. */
  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    await ctx.resume().catch(() => {});
    this.onRunning();
  }

  setMuted(muted: boolean) {
    writeMuted(muted);
    this.publish({ muted });
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  /** The Master's console switches. */
  setEnabled(settings: { music: boolean; sfx: boolean }) {
    this.enabled = settings;
    if (!this.ctx || !this.music || !this.sfx) return;
    this.music.gain.setTargetAtTime(settings.music ? MUSIC_LEVEL : 0, this.ctx.currentTime, 0.3);
    this.sfx.gain.setTargetAtTime(settings.sfx ? SFX_LEVEL : 0, this.ctx.currentTime, 0.05);
  }

  /** Looks for an MP3 override of every cue, once. A missing file simply leaves the synth version in place. */
  private preload() {
    if (this.preloading || !this.ctx) return this.preloading ?? Promise.resolve();
    const ctx = this.ctx;
    this.preloading = Promise.allSettled(CUES.map(async (cue) => {
      try {
        const response = await fetch(`/audio/${cue}.mp3`);
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || type.includes("text/html")) { this.samples.set(cue, null); return; }
        this.samples.set(cue, await ctx.decodeAudioData(await response.arrayBuffer()));
      } catch {
        this.samples.set(cue, null);
      }
    })).then(() => {
      // A loop that started on the synth switches to its MP3 once it has loaded.
      const playing = this.current?.cue;
      if (playing && this.samples.get(playing)) { this.current?.stop(0.8); this.current = null; this.applyLoop(); }
    });
    return this.preloading;
  }

  /** Plays a one-shot effect now. */
  play(cue: OneShotCue) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.sfx) return;
    const at = ctx.currentTime + 0.02;
    const sample = this.samples.get(cue);
    const out = ctx.createGain();
    out.connect(this.sfx);
    let length: number;
    if (sample) {
      const source = ctx.createBufferSource();
      source.buffer = sample;
      source.connect(out);
      source.start(at);
      length = sample.duration;
    } else {
      length = ONE_SHOTS[cue](ctx, out, at);
    }
    const handle = {
      cue,
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        window.setTimeout(() => out.disconnect(), 400);
        this.shots.delete(handle);
      },
    };
    this.shots.add(handle);
    window.setTimeout(() => { if (this.shots.delete(handle)) out.disconnect(); }, (length + 3.5) * 1000);
  }

  /** Cuts a playing one-shot short, e.g. a drumroll when the Master steps back. */
  stop(cue: OneShotCue) {
    for (const shot of [...this.shots]) if (shot.cue === cue) shot.stop();
  }

  /** The music bed that should be playing; null for silence. Re-asking for the playing loop changes nothing. */
  loop(cue: LoopCue | null) {
    this.wanted = cue;
    this.applyLoop();
  }

  private applyLoop() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.music) return;
    if (this.current?.cue === this.wanted) return;
    this.current?.stop(this.wanted ? 0.9 : 1.6);
    this.current = this.wanted ? this.startLoop(this.wanted) : null;
  }

  private startLoop(cue: LoopCue): Playing {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
    out.connect(this.music!);
    const finish = (fadeSeconds: number, cleanup: () => void) => {
      cleanup();
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
      out.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSeconds);
      window.setTimeout(() => out.disconnect(), (fadeSeconds + LOOKAHEAD_S + 0.5) * 1000);
    };

    const sample = this.samples.get(cue);
    if (sample) {
      const source = ctx.createBufferSource();
      source.buffer = sample;
      source.loop = true;
      source.connect(out);
      source.start();
      return { cue, stop: (fade) => finish(fade, () => source.stop(ctx.currentTime + fade + 0.1)) };
    }

    let bar = 0;
    let next = ctx.currentTime + 0.05;
    const schedule = () => {
      // After the laptop sleeps or the tab is throttled, resume from now instead of playing every missed bar at once.
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
      while (next < ctx.currentTime + LOOKAHEAD_S) {
        next += LOOPS[cue](ctx, out, next, bar);
        bar += 1;
      }
    };
    schedule();
    const timer = window.setInterval(schedule, SCHEDULER_MS);
    return { cue, stop: (fade) => finish(fade, () => window.clearInterval(timer)) };
  }
}

const SERVER_SNAPSHOT: Snapshot = { unlocked: false, muted: false };

/** The one soundboard for this browser tab. */
export const soundboard = new Soundboard();
