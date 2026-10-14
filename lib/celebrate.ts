// Confetti for reveals. Browser only; the library is loaded on first use and respects "reduce motion".

import type { Options } from "canvas-confetti";

const COLORS = ["#e8b85b", "#f4c866", "#0e6a68", "#9cc3bd", "#ffffff"];

async function fire(options: Options) {
  const confetti = (await import("canvas-confetti")).default;
  await confetti({ colors: COLORS, disableForReducedMotion: true, zIndex: 60, ...options });
}

/** A centred burst; intensity 1–3 scales the amount and spread. */
export function burst(intensity: 1 | 2 | 3 = 1) {
  void fire({ particleCount: 60 * intensity, spread: 50 + 25 * intensity, startVelocity: 30 + 8 * intensity, origin: { y: 0.65 } });
}

/** Cannons from both sides for a couple of seconds, plus one big burst. Used for #1 and the winner. */
export function grandFinale() {
  burst(3);
  const end = Date.now() + 2500;
  const frame = () => {
    void fire({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
    void fire({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
