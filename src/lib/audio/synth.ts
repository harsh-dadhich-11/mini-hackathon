// Built-in game-show soundtrack, generated with Web Audio so the projector has music with no files to license.
// Every cue here can be replaced by dropping an MP3 of the same name into public/audio/ (see its README).
// Browser only. Each one-shot schedules its notes from `start` and returns its length in seconds; each loop
// schedules one bar from `start` and returns the bar's length, and the soundboard keeps asking for the next bar.

type Ctx = BaseAudioContext;

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

function noiseBuffer(ctx: Ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

type ToneOptions = {
  type?: OscillatorType;
  freq: number;
  /** Pitch the note glides to by the end of `dur`. */
  toFreq?: number;
  dur: number;
  gain: number;
  attack?: number;
  release?: number;
  detune?: number;
  /** Low-pass filter: starts at `cutoff`, opens to `cutoffPeak` after the attack. */
  cutoff?: number;
  cutoffPeak?: number;
};

function tone(ctx: Ctx, out: AudioNode, start: number, options: ToneOptions) {
  const { type = "sine", freq, toFreq, dur, gain, attack = 0.005, release = 0.08, detune = 0, cutoff, cutoffPeak } = options;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + dur);
  osc.detune.value = detune;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.setValueAtTime(gain, start + Math.max(attack, dur - release));
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
  let head: AudioNode = osc;
  if (cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, start);
    if (cutoffPeak) {
      filter.frequency.exponentialRampToValueAtTime(cutoffPeak, start + attack + 0.04);
      filter.frequency.exponentialRampToValueAtTime(cutoff, start + dur + release);
    }
    osc.connect(filter);
    head = filter;
  }
  head.connect(amp);
  amp.connect(out);
  osc.start(start);
  osc.stop(start + dur + release + 0.05);
}

type NoiseOptions = { dur: number; gain: number; filter: BiquadFilterType; freq: number; toFreq?: number; q?: number; attack?: number };

function noise(ctx: Ctx, out: AudioNode, start: number, options: NoiseOptions) {
  const { dur, gain, filter, freq, toFreq, q = 0.8, attack = 0.002 } = options;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const shaper = ctx.createBiquadFilter();
  shaper.type = filter;
  shaper.frequency.setValueAtTime(freq, start);
  if (toFreq) shaper.frequency.exponentialRampToValueAtTime(toFreq, start + dur);
  shaper.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  source.connect(shaper);
  shaper.connect(amp);
  amp.connect(out);
  source.start(start, Math.random());
  source.stop(start + dur + 0.05);
}

// ---------------------------------------------------------------- Drum kit

const kick = (ctx: Ctx, out: AudioNode, at: number, gain = 0.7) => tone(ctx, out, at, { freq: 150, toFreq: 42, dur: 0.18, gain, release: 0.12 });
const snare = (ctx: Ctx, out: AudioNode, at: number, gain = 0.3) => {
  noise(ctx, out, at, { dur: 0.16, gain, filter: "bandpass", freq: 1900, q: 0.7 });
  tone(ctx, out, at, { type: "triangle", freq: 190, toFreq: 140, dur: 0.06, gain: gain * 0.6 });
};
const hat = (ctx: Ctx, out: AudioNode, at: number, gain = 0.06) => noise(ctx, out, at, { dur: 0.04, gain, filter: "highpass", freq: 7500 });
const crash = (ctx: Ctx, out: AudioNode, at: number, gain = 0.3, dur = 1.8) => noise(ctx, out, at, { dur, gain, filter: "highpass", freq: 4200, q: 0.4 });
const timpani = (ctx: Ctx, out: AudioNode, at: number, gain = 0.6) => {
  tone(ctx, out, at, { freq: 82, toFreq: 62, dur: 1, gain, attack: 0.004, release: 0.4 });
  noise(ctx, out, at, { dur: 0.25, gain: gain * 0.3, filter: "lowpass", freq: 400 });
};
const woodblock = (ctx: Ctx, out: AudioNode, at: number, gain = 0.05, freq = 1600) => tone(ctx, out, at, { freq, dur: 0.025, gain, release: 0.03 });

/** A brass-section stab: three detuned saws per note through an opening low-pass. */
function brass(ctx: Ctx, out: AudioNode, at: number, notes: number[], dur: number, gain = 0.07) {
  for (const note of notes) {
    for (const detune of [-8, 0, 8]) tone(ctx, out, at, { type: "sawtooth", freq: midi(note), dur, gain, attack: 0.025, release: 0.25, detune, cutoff: 500, cutoffPeak: 3200 });
  }
}

function sparkle(ctx: Ctx, out: AudioNode, at: number, notes: number[], gap = 0.06, gain = 0.05) {
  notes.forEach((note, index) => {
    tone(ctx, out, at + index * gap, { freq: midi(note), dur: 0.5, gain, release: 0.5 });
    tone(ctx, out, at + index * gap, { freq: midi(note) * 2, dur: 0.3, gain: gain * 0.3, release: 0.3 });
  });
}

// ---------------------------------------------------------------- One-shots

export const ONE_SHOTS = {
  tick(ctx: Ctx, out: AudioNode, at: number) {
    woodblock(ctx, out, at, 0.35, 1150);
    return 0.1;
  },
  buzzer(ctx: Ctx, out: AudioNode, at: number) {
    for (const freq of [98, 103.5]) tone(ctx, out, at, { type: "square", freq, dur: 0.85, gain: 0.12, attack: 0.01, release: 0.12, cutoff: 1400 });
    return 1;
  },
  /** A two-second snare roll that speeds up and swells. The sting that follows carries the crash. */
  drumroll(ctx: Ctx, out: AudioNode, at: number) {
    const length = 1.95;
    let t = 0;
    while (t < length) {
      const progress = t / length;
      noise(ctx, out, at + t, { dur: 0.07, gain: 0.08 + 0.32 * progress ** 1.6, filter: "bandpass", freq: 1700 + 900 * progress, q: 0.9 });
      t += 0.075 - 0.045 * progress;
    }
    tone(ctx, out, at, { freq: 55, dur: length, gain: 0.08, attack: length * 0.8, release: 0.1 });
    return length;
  },
  "sting-3"(ctx: Ctx, out: AudioNode, at: number) {
    brass(ctx, out, at, [60, 64, 67, 72], 0.45);
    kick(ctx, out, at, 0.8);
    crash(ctx, out, at, 0.18, 1.2);
    return 1.2;
  },
  "sting-2"(ctx: Ctx, out: AudioNode, at: number) {
    brass(ctx, out, at, [55, 59, 62, 67], 0.16);
    brass(ctx, out, at + 0.2, [60, 64, 67, 72], 0.85);
    kick(ctx, out, at + 0.2, 0.9);
    timpani(ctx, out, at + 0.2);
    crash(ctx, out, at + 0.2, 0.28, 1.6);
    return 1.8;
  },
  /** The Boardroom #1 fanfare: three pickups and a big held chord. */
  "sting-1"(ctx: Ctx, out: AudioNode, at: number) {
    [0, 0.12, 0.24].forEach((offset) => brass(ctx, out, at + offset, [67, 71], 0.08, 0.06));
    brass(ctx, out, at + 0.38, [60, 64, 67, 72, 76], 1.5, 0.065);
    kick(ctx, out, at + 0.38, 1);
    timpani(ctx, out, at + 0.38, 0.8);
    crash(ctx, out, at + 0.38, 0.4, 2.4);
    sparkle(ctx, out, at + 0.45, [84, 88, 91, 96]);
    return 2.6;
  },
  /** The winner: a longer fanfare that climbs, then a held chord with a timpani roll. */
  champion(ctx: Ctx, out: AudioNode, at: number) {
    const steps: [number, number[], number][] = [
      [0, [67], 0.1], [0.12, [67], 0.1], [0.24, [67], 0.1], [0.36, [72], 0.35],
      [0.78, [71], 0.14], [0.96, [72], 0.14], [1.14, [76], 0.4],
    ];
    for (const [offset, notes, dur] of steps) brass(ctx, out, at + offset, notes.flatMap((note) => [note, note - 12]), dur, 0.055);
    [0.36, 1.14].forEach((offset) => { kick(ctx, out, at + offset, 0.9); timpani(ctx, out, at + offset, 0.6); });
    for (let index = 0; index < 10; index += 1) timpani(ctx, out, at + 1.6 + index * 0.06, 0.15 + index * 0.03);
    brass(ctx, out, at + 2.2, [48, 60, 64, 67, 72, 76, 79], 2.2, 0.05);
    kick(ctx, out, at + 2.2, 1);
    crash(ctx, out, at + 2.2, 0.45, 3);
    sparkle(ctx, out, at + 2.25, [84, 88, 91, 96, 100, 103], 0.07);
    return 4.6;
  },
  /** For a new leaderboard or a question coming up. */
  whoosh(ctx: Ctx, out: AudioNode, at: number) {
    noise(ctx, out, at, { dur: 0.55, gain: 0.22, filter: "bandpass", freq: 250, toFreq: 4500, q: 1.4, attack: 0.3 });
    kick(ctx, out, at + 0.5, 0.8);
    crash(ctx, out, at + 0.5, 0.15, 1);
    return 1.4;
  },
  hit(ctx: Ctx, out: AudioNode, at: number) {
    tone(ctx, out, at, { freq: 120, toFreq: 32, dur: 0.5, gain: 0.9, release: 0.3 });
    noise(ctx, out, at, { dur: 0.25, gain: 0.25, filter: "lowpass", freq: 900 });
    crash(ctx, out, at, 0.12, 0.9);
    return 1;
  },
  chime(ctx: Ctx, out: AudioNode, at: number) {
    sparkle(ctx, out, at, [79, 84, 88], 0.09, 0.07);
    return 1;
  },
} satisfies Record<string, (ctx: Ctx, out: AudioNode, at: number) => number>;

// ---------------------------------------------------------------- Loops (one bar per call)

const LOBBY_CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]];
const THINK_ROOTS = [45, 41, 48, 43];
const THINK_TRIADS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const THINK_BASS = [0, 0, 12, 0, 0, 7, 12, 7];

function thinkBar(ctx: Ctx, out: AudioNode, at: number, bar: number, full: boolean) {
  const beat = 60 / 112;
  const root = THINK_ROOTS[bar % 4];
  for (const note of THINK_TRIADS[bar % 4]) {
    for (const detune of [-6, 6]) tone(ctx, out, at, { type: "sawtooth", freq: midi(note), dur: beat * 4, gain: full ? 0.022 : 0.016, attack: 0.4, release: 0.4, detune, cutoff: 900 });
  }
  for (let index = 0; index < 4; index += 1) woodblock(ctx, out, at + index * beat, index === 0 ? 0.06 : 0.035, index % 2 ? 1300 : 1600);
  if (full) {
    THINK_BASS.forEach((offset, index) => tone(ctx, out, at + index * beat / 2, { type: "sawtooth", freq: midi(root + offset), dur: beat / 2 - 0.05, gain: 0.11, attack: 0.008, release: 0.05, cutoff: 650 }));
    [0, 2].forEach((index) => kick(ctx, out, at + index * beat, 0.45));
    [1, 3].forEach((index) => snare(ctx, out, at + index * beat, 0.14));
    for (let index = 0; index < 8; index += 1) hat(ctx, out, at + index * beat / 2 + (index % 2 ? 0 : 0.002), index % 2 ? 0.05 : 0.025);
  } else {
    [0, 2].forEach((index) => tone(ctx, out, at + index * beat, { type: "triangle", freq: midi(root), dur: beat * 1.6, gain: 0.08, release: 0.2 }));
  }
  return beat * 4;
}

export const LOOPS = {
  /** Welcome music: a light major arpeggio. */
  lobby(ctx: Ctx, out: AudioNode, at: number, bar: number) {
    const beat = 60 / 98;
    const chord = LOBBY_CHORDS[bar % 4];
    [0, 1, 2, 3, 2, 1, 2, 3].forEach((index, step) => tone(ctx, out, at + step * beat / 2, { type: "triangle", freq: midi(chord[index] + 12), dur: 0.22, gain: 0.06, release: 0.18 }));
    [0, 2].forEach((index) => tone(ctx, out, at + index * beat, { freq: midi(chord[0] - 12), dur: beat * 1.5, gain: 0.16, release: 0.2 }));
    [0, 2].forEach((index) => kick(ctx, out, at + index * beat, 0.25));
    [1, 3, 5, 7].forEach((index) => hat(ctx, out, at + index * beat / 2, 0.03));
    return beat * 4;
  },
  /** The silent pick: pad, a ticking clock and a soft bass. */
  "think-soft"(ctx: Ctx, out: AudioNode, at: number, bar: number) {
    return thinkBar(ctx, out, at, bar, false);
  },
  /** The debate: the full quiz-show bed. */
  think(ctx: Ctx, out: AudioNode, at: number, bar: number) {
    return thinkBar(ctx, out, at, bar, true);
  },
  /** The last minute: a faster pulse that leans a semitone up every few bars. */
  tension(ctx: Ctx, out: AudioNode, at: number, bar: number) {
    const beat = 60 / 138;
    const root = [45, 45, 46, 45][bar % 4];
    for (let index = 0; index < 16; index += 1) tone(ctx, out, at + index * beat / 4, { type: "sawtooth", freq: midi(root), dur: beat / 4 - 0.03, gain: index % 4 === 0 ? 0.12 : 0.07, attack: 0.004, release: 0.03, cutoff: 520 });
    for (let index = 0; index < 16; index += 1) tone(ctx, out, at + index * beat / 4, { freq: midi(index % 2 ? root + 31 : root + 36), dur: beat / 4 - 0.02, gain: 0.014, release: 0.02 });
    for (let index = 0; index < 4; index += 1) kick(ctx, out, at + index * beat, 0.5);
    for (let index = 0; index < 8; index += 1) hat(ctx, out, at + index * beat / 2 + beat / 4, 0.04);
    return beat * 4;
  },
  /** Sudden death: a heartbeat over a low drone. */
  "sudden-death"(ctx: Ctx, out: AudioNode, at: number, bar: number) {
    const length = 60 / 72;
    tone(ctx, out, at, { freq: 62, toFreq: 40, dur: 0.16, gain: 0.8, release: 0.12 });
    tone(ctx, out, at + 0.2, { freq: 58, toFreq: 38, dur: 0.14, gain: 0.55, release: 0.12 });
    tone(ctx, out, at, { freq: 55, dur: length, gain: 0.05, attack: 0.05, release: 0.05 });
    tone(ctx, out, at, { freq: 82.4, dur: length, gain: 0.025, attack: 0.05, release: 0.05 });
    if (bar % 4 === 0) tone(ctx, out, at, { freq: 1760, dur: 0.2, gain: 0.025, release: 1.4 });
    return length;
  },
} satisfies Record<string, (ctx: Ctx, out: AudioNode, at: number, bar: number) => number>;

export type OneShotCue = keyof typeof ONE_SHOTS;
export type LoopCue = keyof typeof LOOPS;
