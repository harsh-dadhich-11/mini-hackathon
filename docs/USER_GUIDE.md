# Boardroom Challenge · User guide

How to run the BOT Consulting Boardroom Challenge on the day: what each screen does, which button to press, and what to do when something goes wrong.

- **Masters** (event hosts) run everything from **Event control** at `/master`.
- **Captains** (one per table) play on their phone or laptop at the event link (`/team`). The two finalists keep using their laptops on stage.
- **The projector** shows `/display` on the stage screen, opened with a projector link.

---

## 1. Before the event

### 1.1 One-time technical setup

Whoever deploys the app does this once. Full steps are in the [README](../README.md).

| Setting | Where | What it is |
|---|---|---|
| `DATABASE_URL` | Vercel environment | Supabase *transaction pooler* connection (port 6543) |
| `DIRECT_URL` | Your terminal, for migrations only | Supabase *session pooler* connection (port 5432) |
| `RESEND_API_KEY` | Vercel environment | Resend API key that sends sign-in codes |
| `RESEND_FROM_EMAIL` | Vercel environment | Sender on your Resend-verified domain, e.g. `Boardroom Challenge <noreply@botconsulting.io>` |
| `DATABASE_CA_CERT` (recommended) | Vercel environment | Supabase's SSL certificate (Supabase → Database → SSL Configuration → Download certificate), pasted as one value. With it, the app verifies it is really talking to Supabase. |
| Master emails | `src/data/event.ts` → `MASTER_EMAILS` | The only accounts that can sign in to Event control |

After every update that touches the database, run `npm run db:migrate` against the event database **before** deploying. This release adds migrations `0003`–`0005`; the app errors until they are applied.

### 1.2 Sign in as a Master

1. Open `/master`.
2. Enter your Master email and click **Send my code**.
3. Enter the six-digit code from the email and click **Sign in**, **in the same browser** that asked for it.

Codes expire after 10 minutes and work once. A new code can be requested after one minute. Sessions last 12 hours.

**Security:** each code only works in the browser that requested it, so someone who knows a Master's email can neither use nor burn that Master's code, or lock them out. **Sign out all Masters** (next to Sign out) ends every Master session on every device. If nobody at all can get into Event control, whoever deployed the app can run `DIRECT_URL=… npm run unlock-signin -- name@botconsulting.io` to clear the sign-in limits for that email.

### 1.3 Configure the event (first time only)

On first sign-in you see **Configure the event**. Click **Configure secure event**. This creates the fixed schedule, a practice round plus six scored rounds:

| Round | Name | Lead hat | Who is official |
|---|---|---|---|
| Practice | The Coffee Crisis (2 minutes) | People | Everyone, **never counts** |
| 1 | Security Incident | Finance and Risk | All teams (qualifier) |
| 2 | AI Disruption | Delivery and Technology | All teams (qualifier) |
| 3 | Talent Bomb | People | All teams (qualifier) |
| 4 | Business Pressure | Finance and Risk | All teams (qualifier) · decides the Top 2 |
| 5 | Client Escalation | Business and Clients | Top 2 on stage · everyone else plays for the hamper |
| 6 | The Acquisition | Business and Clients | Top 2 on stage · everyone else plays for the hamper |

Rounds 1–4 add up. The Top 2 on that total go on stage, where **scores reset**: Round 5 + Round 6 decides the winner. Every team answers on its Captain device in every round, finalists included.

Every scored round has a fixed six-minute answer window, split into the deck's debate segments (§2.3). The practice round has a two-minute window.

**Event created before the practice round existed?** The Questions tab shows **Upgrade schedule**. On an event already on the six rounds it only adds the practice round, keeping every question and score. An older (v4) schedule is replaced instead, which works only while the event has no answers, scores, qualifications or sudden deaths.

### 1.4 Add the teams (Teams tab)

Up to **30 active teams**, one Captain each.

- **Add a team:** fill in Team name, Table, Captain name and Captain email, then click **Add team**.
- **Import teams:** paste one team per line as `team name, table, captain name, captain email`, then click **Import teams**.
  - You can paste rows straight from Excel or Google Sheets (tab-separated), or use CSV.
  - Put a name containing a comma in quotes: `"Smith, Jones & Co", 4, Asha Rao, asha@example.com`.
  - A header row is skipped if it uses the column names above.
  - Any line that fails is listed with its line number; the rest are still imported.

Rules: Captain emails must be unique, and a Master email can never be a Captain email.

### 1.5 Load the questions (Questions tab)

Click **Load Summit question pack**. It fills every draft round with the reviewed content from the Review Pack: the scenario, the setup line, six options, the three Boardroom Choices with their evidence, the lead hat, the principle, why the other options rank lower, and the emcee follow-up question for Rounds 5 and 6. The pack ships with the app, on the server only, so the answer keys never reach a browser before their reveal.

Each round needs a scenario, **six options (A–F)** and the **three Boardroom Choices** in ranked order. Everything else is optional:

| Field | Where it appears |
|---|---|
| Setup line (`context`) | Under the scenario, on the projector and on Captain devices |
| Lead hat (`leadHat`) | On the question, so that hat speaks first in the hat round |
| Evidence (one per Boardroom Choice) | On the projector as each choice is revealed |
| Principle (`principle`) and why the others rank lower (`othersNote`) | On the projector only at the last reveal step, because they give the answer away |
| Follow-up (`followUp`) | Master console only, as a prompt for the emcee on stage |

- **Edit** a round to change it. Draft rounds only.
- Or paste every round at once under **Import question pack (JSON)** and click **Import**. Use the round ids `round-1` … `round-6`:

```json
[
  {
    "id": "round-1",
    "scenario": "“The Board says…”",
    "context": "You are the leadership team of…",
    "leadHat": "Finance and Risk",
    "principle": "The principle being tested",
    "options": [{ "id": "A", "text": "..." }, { "id": "B", "text": "..." }, { "id": "C", "text": "..." },
                { "id": "D", "text": "..." }, { "id": "E", "text": "..." }, { "id": "F", "text": "..." }],
    "answers": ["C", "F", "A"],
    "evidence": ["Why C is #1", "Why F is #2", "Why A is #3"],
    "othersNote": "B: ... C: ... E: ...",
    "followUp": ""
  }
]
```

The amber banner at the top of Event control disappears once at least one team is active and all six questions are loaded.

### 1.6 Set up the projector (Screen control tab)

1. Click **Create projector link** and give it a name (e.g. *Main stage laptop*).
2. The link is shown **once**. Copy it and open it on the stage laptop, then press **F11** for full screen.
3. That laptop now shows the display without anyone signing in. It can only ever show what the audience is meant to see.

Projector links last 72 hours. **Revoke** a link at any time from the same card; that screen stops updating immediately and says the link was revoked.

> The projector no longer needs a Master signed in. Signing out of Event control, or a Master session expiring, does not affect the big screen.

### 1.7 Send Captains their link

Share the event URL (the site root sends people to `/team`). On QR cards, link only to that general URL.

To email a Captain a code directly, click **Resend OTP** next to their team in **Teams**.

### 1.8 Final checks

- Send yourself a test code to confirm email delivery. If an email fails, Event control shows a red **"The last sign-in email did not go out"** banner.
- Confirm the projector shows **Welcome to the Boardroom.**
- On the projector, click **Click to enable sound** once (browsers block sound until someone clicks the page), and check the lobby music plays through the venue speakers. See §5.

---

## 2. Running each round (Live control tab)

Live control opens on the round that needs attention. The round chips across the top show each round's state:

| State | Meaning |
|---|---|
| **draft** | Not started yet |
| **open** | Answers being taken; the timer is running |
| **paused** | Timer stopped; no answers accepted |
| **closed** | Answers locked, **not yet counted** |
| **scored** | Points calculated, **not yet public** |
| **published** | Points on the leaderboard |

### 2.0 The practice round (before Round 1)

A light, two-minute mini-round so every table tries the controls before anything counts. It runs exactly like a real round: **Open round**, Captains drag or tap three picks and **Lock it in**, the timer runs out (or **Close now**), **Score round**, then the full reveal with drumrolls. Each phone shows *"You would have scored X"*. Then click **Finish practice**: the projector returns to the welcome screen and no leaderboard is shown.

Practice points never reach any total, leaderboard or the hamper. The practice round is optional, and it can't be run once Round 1 has started.

### 2.1 The run-book for every round

1. **Open round.** Captains see the question and the projector shows it with the countdown and the debate segments.
2. Watch **Submissions**: a tick per team as answers arrive (answers stay hidden). "along" marks teams playing for the chocolate hamper in Rounds 5–6.
3. The round closes by itself at 00:00, or click **Close now**.
4. **Score round.** ⚠️ Closing alone does **not** count points.
5. Review **Round scores**. Use **Correct** to override one team's points (0–100, reason required). Leave it blank to clear an override.
6. Optional: **SCORES GREEN** records your check in the audit log.
7. Reveal on the projector with **Scenario → Reveal #3 → Reveal #2 → Reveal #1 → Principle & why not the others**. Each of #3, #2 and #1 is held behind a two-second drumroll, then lands with a sting and confetti. Captains see the same reveal on their devices, with their own picks and points.
8. **Publish** (Rounds 1–4 only). This puts the **cumulative** leaderboard on the projector: "After Round N · Top 10", with Rounds 1 to N added together.

Ties share a rank, so a Top 10 can show more than ten teams.

The next qualifier round can only be opened once the previous one is published.

### 2.2 The stage rounds (5 and 6): hold the reveal

The finalists play exactly like everyone else, on their laptops. To build suspense, **nothing from Round 5 is revealed when it ends**:

1. Run Round 5 as normal, close it and click **Score round**. The reveal controls stay locked, and Captains see *"Answers locked. The stage results stay secret until after Round 6."*
2. Open **Round 6** straight away. It only needs Round 5 to be *scored*, not published.
3. Close and score Round 6. The reveal controls now unlock for both stage rounds.
4. Reveal **Round 5**, then **Round 6** (#3 → #2 → #1 → principle).
5. In **Qualify & awards**, confirm the winner and the chocolate hamper (sudden death if either is tied, §3.1).
6. In **Screen control → Awards**: **Intro → Chocolate hamper → Runner-up → Winner**.

There is no stage scoreboard on screen: the awards are the reveal. The emcee's follow-up question for each stage round appears in the Live control card.

### 2.3 Debate segments on the timer

The six-minute timer follows the deck. The projector lights up the running segment; Captain screens and the Master timer show its name.

| Time left | Segment | |
|---|---|---|
| 6:00–5:00 | **Silent pick** | Write your own #1. Reveal together. |
| 5:00–3:00 | **Hat round** | 30 seconds per hat, lead hat first |
| 3:00–1:30 | **Open debate** | The Advisor asks, and speaks last |
| 1:30–1:00 | **Close** | Sum up. The Submitter reads back. |
| 1:00–0:00 | **Lock now** | Captains lock their three ranked picks |

**Extend** adds time to the end, so it lengthens the lock window.

### 2.4 Fixing things during a round

| Situation | What to do |
|---|---|
| Need a break | **Pause**, then **Resume** (a reason is required for each) |
| Room needs more time | **Extend** adds 10–600 seconds. On a closed but unscored round the same button is **Reopen**. |
| A phone or Wi-Fi failed | Collect the paper slip, then **Record paper answer**: type the exact team name, then three letters best-first (`A C F`, `A,C,F` or `ACF`), then a reason. Only possible before scoring. |
| Wrong Boardroom Choice found after the round opened | **Questions → Correct answer key**: change the ranked choices and evidence (a reason is required). If the round was already scored, click **Re-score**, then reveal again and **Republish correction**. |
| A score was wrong after publishing | **Correct** the score (or Re-score), then **Republish correction**. The projector shows the corrected board. |

**Locks** protect decisions already made: once Round 5 opens, Rounds 1–4 scores can't be changed, because they decided the Top 2.

---

## 3. Qualifying and awards (Qualify & awards tab)

Each card shows live standings, with a dashed line at the cutoff.

| Card | Decided from | Notes |
|---|---|---|
| **Top 2 after Round 4** | Rounds 1–4 total, all teams | Locks when Round 5 opens |
| **Winner & runner-up** | Rounds 5 + 6, Top 2 only (scores reset) | Needs both stage rounds scored |
| **Chocolate hamper** | Every round 1–6, all teams except the two finalists | Needs both stage rounds scored |

- Click **Confirm …** to lock a stage in.
- **Confirming never changes the projector.** Reveal results from Screen control, so nothing is spoiled early.
- **Show hamper race Top 5 after R4** puts the hamper standings on the projector after Round 4. There is no end-of-game hamper board: the hamper is revealed in the awards.

### 3.1 Ties: sudden death (multiple choice, only the right answer counts)

When teams level on score straddle the cutoff (for the Top 2, the winner or the hamper), the card turns amber and shows **Start sudden death**.

1. Pick a question: **SD1–SD4** from the deck, **SD5–SD6** as spares for a replay, or **Custom**. Each has four options, A–D; tick the correct one. **SD3 (BOT Consulting's founding year) has no options stored: type four years and tick the right one before using it.**
2. Click **Start sudden death**. The projector switches to the question and its four options, with a 60-second timer and a heartbeat soundtrack. Only the tied teams get four answer buttons on their Captain device; every other table sees *"Sudden death in progress"*.
3. The projector shows **Locked in** next to each tied team as its pick arrives (never which letter). The console shows the letters live. **Enter** records a letter for a team whose device failed (a reason is required).
4. It closes by itself at 00:00, or click **Close now**.
5. **Reveal answer** (the right option lights up), then **Reveal picks** (every team's letter, ✓ or ✗). Each lands after a drumroll.
6. Click **Confirm with this result**. The picks are recorded as the ruling.

**Still level?** If more teams got it right than there are places, or nobody did, the card says so and offers **another question for just those teams**. If some got it right and there's still a place left, those teams are through and the rest replay for it.

A manual **Game Jury ruling** is still available under *Game Jury ruling instead (fallback)*.

---

## 4. Driving the projector (Screen control tab)

The card at the top says what is on the projector right now; the button for it is highlighted.

| Control | Shows |
|---|---|
| **Welcome screen** | "Welcome to the Boardroom." with the BOT owl |
| **Last published standings** | The newest board from a Publish button. Never a qualifier result. |
| **Questions → Round N** | That round's question and timer (shown automatically when a round opens) |
| **Music & effects** | The emcee's switches for the projector soundtrack (§5) |
| **Sudden death** | **Question → Reveal answer → Reveal picks** for the latest sudden death |
| **Boardroom Choices reveal** | Scenario → #3 → #2 → #1 (each after a drumroll), with evidence and confetti, then the principle and why the others rank lower. Rounds 5–6 unlock only when both are scored. |
| **Top 2 reveal** | **Intro**, then the two finalists, bottom-up, each after a drumroll |
| **Awards** | **Intro → Chocolate hamper → Runner-up (₹11,000) → Winner (₹21,000)**. Confirm the winner *and* the hamper first. |

If the projector loses its connection it keeps showing the last screen with a **Reconnecting…** badge. It never jumps back to the welcome screen.

---

## 5. Sound

The projector is the only thing that makes a sound; phones and laptops at the tables stay silent.

| On screen | Music | Effects |
|---|---|---|
| Welcome, standings | Light lobby music | A swoosh when a new board appears |
| Question: Silent pick | A soft "thinking" bed with a ticking clock | A hit as the question opens |
| Question: Hat round → Close | The full quiz-show bed | A chime at each new segment |
| Question: Lock now (last minute) | A faster tension pulse | Ticks in the last 10 seconds, then a buzzer at 00:00 |
| Reveals, Top 2, awards | Silence, so each moment stands out | Drumroll, then a sting (#3 small, #2 bigger, #1 fanfare); the winner gets the big fanfare |
| Sudden death | A heartbeat | Ticks, buzzer, then drumrolls for the answer and the winner |

- **Enabling sound:** browsers block sound until the page is clicked. The projector header shows **Click to enable sound** until someone clicks (or presses a key) on the stage laptop. Do it during setup.
- **Muting just the projector:** the speaker button in its header, or press **M**.
- **From the console:** **Screen control → Music & effects** switches music and effects on or off on the projector within two seconds, e.g. to kill the music while the emcee talks to the finalists.
- **Your own tracks:** every cue is generated in the browser, so nothing needs licensing. To replace any cue with a recording, drop an MP3 with the cue's name into `public/audio/` and redeploy (see `public/audio/README.md`).

---

## 6. For Captains (on your phone or laptop)

1. **Sign in:**
   1. Open the event link.
   2. Enter your rostered Captain email and tap **Send my code**.
   3. Enter the six-digit code and tap **Sign in**.

   No email? Wait a minute and tap **Resend code**, or raise your table's flag card.
2. **Wait:** "You're signed in. Keep this screen open." The question appears by itself when the round opens.
3. **Answer:**
   1. Read *The Board says*, and note the **Lead hat**: that hat speaks first in the hat round. The timer box shows which debate segment is running.
   2. Drag your three strongest options into **#1 · 40 pts**, **#2 · 30 pts** and **#3 · 20 pts**, or tap an option to drop it into the next empty slot. Tap ✕ to remove one, or use **Clear all**.
   3. Tap **Lock it in**.

   You can change your answer and tap **Update answer** until the timer hits 00:00. Your last saved answer counts.
4. **Reveal:** as the Boardroom Choices appear on the main screen, your phone shows them too, with ✓ for your matches and your round score once #1 is out. Rounds 5–6 are revealed together after Round 6.
5. **Playing for the hamper:** in Rounds 5–6, teams outside the Top 2 see *"You're playing for the chocolate hamper"*. Keep answering: the highest six-round score outside the Top 2 wins it.
6. **Sudden death:** if your team is tied at a cutoff, a red **Sudden death** box appears with one question and four options. Tap your answer, then **Lock it in** before the 60 seconds run out. You can change it until then. Only the right answer counts.
7. **Practice round:** the first question of the day is practice. Nothing counts; your phone shows what you *would* have scored.

If your phone loses Wi-Fi you'll see **Reconnecting…**. Your saved answer is safe.

---

## 7. Scoring rules

- Each of your three picks scores if it is one of the Boardroom Choices, wherever you ranked it:
  - Boardroom **#1 = 40**, **#2 = 30**, **#3 = 20**.
- **+10 bonus** only if your *first* pick is Boardroom #1.
- The maximum per round is **100**: all three correct, with #1 ranked first.
- No answer scores 0. Speed doesn't count.
- Equal totals share a rank (1, 1, 3…).
- Rounds 1–4 add up for the Top 2. Rounds 5 + 6 decide the winner (scores reset for the stage). The hamper counts all six rounds, raw.

---

## 8. Privacy: what each person can see

| | Captain phone | Projector | Master |
|---|---|---|---|
| Scenario and options | Current round only | ✓ | ✓ |
| Boardroom Choices and evidence | Only what the projector has already revealed (no evidence on phones) | Only after scoring, one step at a time | ✓ |
| Principle and why the others rank lower | Never | Only at the last reveal step | ✓ |
| Sudden-death correct option and picks | Their own pick; the correct option once it is on screen | Only who has locked in, until the Master reveals the answer, then the picks | ✓ (live) |
| Their own answer | ✓ | — | ✓ |
| Other teams' answers | **Never** | **Never** | Who submitted, and the audit log |
| Emails | Never | Never | ✓ |

These rules are enforced on the server, not just hidden in the page. A Captain who opens the browser's developer tools (Inspect element, the Network tab or the page source) sees the same data as their screen, and nothing more. The answer keys and sudden-death answers live only on the server and are never shipped in the site's JavaScript. Automated tests check this on every build (`src/lib/game/publicViews.test.ts`).

**Who can open what:**
- `/team` shows only the sign-in form until a rostered Captain signs in with an emailed code.
- `/display` and `/leaderboard` show only "This screen isn't connected yet" without a projector link or a Master session.
- `/master` shows only the Master sign-in form.
- Every API answers 401 without the right session. A Captain's session can't open the projector feed or the Master API.

**Also in place:**
- Every write must come from the site's own pages (CSRF protection).
- The site can't be framed by another page.
- Answers are rate-limited per team.
- Inputs are length-checked.
- Nothing is cached.

---

## 9. Audit log

Every action is recorded with who did it, when, and why. That includes:
- opens, pauses, extensions
- scores and score corrections
- answer-key corrections
- paper answers
- sudden deaths (start, close, every answer, manual entries) and tie rulings
- projector changes
- projector links
- sign-ins and sign-in lock resets

Use the filter box to search by person, action or round.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| **Leaderboard didn't update after a round** | In Live control, check the round's state. **closed** → click **Score round**, reveal, then **Publish**. Already **published** but the board looks old → click **Republish correction**. |
| **Captain says the code is wrong** | Codes only work in the browser (and device) that asked for them. Ask the Captain to request a new code on the device they'll play on. Or click **Resend OTP** in **Teams**: a code a Master sends works on any device. |
| **"Too many wrong codes"** | Request a new code; a fresh request always gets a fair try. If the Captain shows a red **Sign-in locked** badge in **Teams**, confirm it's really them, click **Reset**, then **Resend OTP**. |
| **No sign-in email** | Check the red email banner in Event control. Verify `RESEND_API_KEY` / `RESEND_FROM_EMAIL` on Vercel, then **Resend OTP**. |
| **"Your Master session has ended"** | Click **Sign in again**. The projector keeps running if it uses a projector link. |
| **Projector shows "This screen isn't connected yet" or "link revoked"** | Create a new projector link in Screen control and open it on that laptop. |
| **Captain's phone shows the old question** | Make sure the page is open and online; it refreshes every 2 seconds and immediately when the phone wakes up. |
| **"This round changed while you were looking at it"** | Another Master acted at the same moment. The console has refreshed; check the state and try again. |
| **Need to change a Captain mid-event** | **Teams → Edit / transfer**, change the email, then confirm. The old Captain is signed out at once, and the new one requests a code. |
| **Team left the event** | Deactivate it with the person icon. A team holding a Top 2 place can't be deactivated until that stage is re-confirmed without them. Delete (bin icon) only works for teams that never played. |
| **No sound on the projector** | Click anywhere on the projector page (look for **Click to enable sound**). Check it isn't muted (speaker button, or **M**), that **Music & effects** are on in Screen control, and the laptop's output device and volume. |
| **Round 5 reveal buttons are greyed out** | That's the suspense hold. Score Round 6 and they unlock. |
| **"Another sudden death is still open"** | Close the open one first (Qualify & awards, or wait for its timer). |
| **Phones show "Having trouble reaching the server…"** | The app retries every 2 seconds by itself; saved answers are safe. If it lasts more than a minute, check the venue Wi-Fi, then Supabase and Vercel status. Answers already on their way at 00:00 are still accepted for 1.5 seconds. |

### Known limitations

- A cross-site page can sign a user out (it can't sign anyone in or read anything).
- Two Masters adding teams at the same instant could exceed 30 active teams by one.
- Without `DATABASE_CA_CERT`, the database connection is encrypted but doesn't verify Supabase's certificate.
- Projector links can be reused for 72 hours by whoever has the URL; they only ever show what the big screen shows. Revoke a link from Screen control if one leaks.
- Rounds that close automatically at 00:00 aren't written to the audit log; manual closes are.
