# Projector sound cues

The projector generates every cue in the browser (`src/lib/audio/synth.ts`), so nothing here is required.
To replace a cue with a recording, add an MP3 with exactly that name to this folder and redeploy. A missing
file keeps the built-in version. Use only tracks you are licensed to play at the event.

| File | Kind | When it plays | Notes |
|---|---|---|---|
| `lobby.mp3` | loop | Welcome screen and standings | Light, seamless loop |
| `think-soft.mp3` | loop | Question: Silent pick (6:00–5:00), and while paused | Quiet "thinking" bed |
| `think.mp3` | loop | Question: Hat round to Close (5:00–1:00) | The main quiz-show bed |
| `tension.mp3` | loop | Question: Lock now (the last minute) | Faster, tenser |
| `sudden-death.mp3` | loop | Sudden death, while answers are open | Heartbeat / suspense |
| `tick.mp3` | one-shot | Each of the last 10 seconds | Very short |
| `buzzer.mp3` | one-shot | Time up | About 1 s |
| `drumroll.mp3` | one-shot | Before each reveal step | **About 2 s.** The card lands at 2.0 s. |
| `sting-3.mp3` | one-shot | Boardroom #3 lands | Small stab |
| `sting-2.mp3` | one-shot | Boardroom #2, a finalist, the hamper, the runner-up | Bigger |
| `sting-1.mp3` | one-shot | Boardroom #1, top qualifier, sudden-death winner | Fanfare |
| `champion.mp3` | one-shot | The winner | The big one, 4–6 s |
| `whoosh.mp3` | one-shot | A new leaderboard | |
| `hit.mp3` | one-shot | A question opens; "Lock now" begins; the sudden-death answer | Impact |
| `chime.mp3` | one-shot | Each new debate segment; the principle | Soft bell |

Loops are faded in and out by the app, so they should start and end at full level and loop cleanly.
