# Boardroom Challenge v4

Production game control for 30 Boardroom Challenge teams. It has three deliberately separate views:

| Route | Audience | What it can access |
|---|---|---|
| `/team` | One rostered Captain per team | Its own team, own answer, current question only |
| `/master` | The two named Masters | Rosters, questions, scoring, tie rulings and screen controls |
| `/display` | Projector / confidence monitor | Small, published screen state only; never emails, submissions, controls or unrevealed keys |

`/leaderboard` remains as a backward-compatible alias for the display. Use `/display` on event day.

## Security model

- Exactly two non-playing Master email accounts are permitted. A Master email cannot be a Captain email.
- Masters sign in on `/master` with an email OTP, using the same rules as Captains. Before any Master exists, only `BOOTSTRAP_MASTER_EMAIL` can sign in, and it becomes the first Master. Master sessions are rechecked against the Master list on every request.
- Exactly 30 active teams are required before Captain sign-in and the public display become live.
- A Captain enters the general `/team` URL, requests an email OTP, then enters the six-digit code. OTPs are single-use, expire after 10 minutes, allow five failed attempts, and have a one-minute resend cooldown. Unknown emails receive the same generic response.
- Captain sessions use a secure, HTTP-only, 12-hour cookie and are rechecked against the roster on every request. A Captain can read or write only their own team.
- A Master can resend a Captain OTP, revoke all of a Captain's sessions, deactivate a team, or perform an audited emergency Captain transfer. A transfer immediately revokes the previous Captain.
- The deployment must be kept access-restricted until the two Masters and all 30 Captain identities are configured. The app also keeps Captain and display services dormant until that configuration is complete.

## Before the event

1. Deploy to Vercel (see **Deploying to Vercel** below) with every environment variable set.
2. Open `/master`, sign in with the `BOOTSTRAP_MASTER_EMAIL` code, and click **Configure secure event**. This creates the six fixed rounds.
3. In **Teams**, add the second Master account and import the roster as `team name, table, captain name, captain email`. The console rejects duplicate Captain emails and Master/Captain overlap.
4. In **Questions**, load all six questions. Each needs exactly six options, three distinct Boardroom Choices, evidence for each choice, and the fixed six-minute submission duration.
5. Confirm the Master banner shows **2/2 Masters**, **30/30 teams**, and **6/6 rounds**. Only then make the Captain URL and `/display` reachable to the room.
6. Use **Resend OTP** for Captain access; QR cards must point only to the general `/team` sign-in URL.

## Six-round run book

Each round has a six-minute, server-authoritative submission window inside its eight-minute show slot. Masters can pause, resume, lock/close or extend it; emergency controls require an audit reason.

| Moment | Master workflow | Display cue |
|---|---|---|
| Rounds 1–3 | Open, close, score, check **SCORES GREEN**, reveal #3 → #2 → #1 with evidence, then mark revealed | Question/countdown; Top 10 after R1 and R2 |
| After R3 | Confirm Top 5. Every team tied at fifth advances. | Top 5 qualifier reveal |
| Round 4 | Top 5 compete for the main game; all other teams keep submitting for the Audience Team race. | Question/countdown |
| After R4 | Confirm Top 2. Use an audited sudden-death ruling only when the cutoff tie leaves more than two possible finalists. | Top 2 reveal; Audience Team Top 5 |
| Rounds 5–6 | Enter the two finalists' paddle choices in **Live control**. Every other Captain keeps submitting online for Audience Team points. | R5 stage scoreboard; final scoreboard and Audience Team final Top 5 |
| Awards | Confirm audience winner, winner and runner-up; then step through awards. | Audience Champion, runner-up, winner |

## Scoring and auditability

- Each raw answer is stored for all six rounds; a non-submission is stored as zero when scoring runs.
- Boardroom Choices score 40 / 30 / 20 points. A team receives an additional 10 only when its first-ranked selection is Boardroom Choice #1. There are no v4 multipliers.
- Main-game qualification is separate from the Audience Team total. Audience totals are cumulative across all six rounds and exclude only the two finalists at the final award.
- Every score correction, tie ruling, Captain transfer, lock/timer change, display cue, paper answer and manual paddle entry records actor, timestamp and reason in **Audit log**.
- Paper slips remain the Wi-Fi fallback: select **Record paper answer**, enter the team and ranked choices, and record the reason before scoring.

## Deploying to Vercel

The app is a standard Next.js project. Its database is [Turso](https://turso.tech), which is hosted SQLite (libSQL).

1. Create the database and an access token:
   ```bash
   turso db create boardroom
   turso db show boardroom --url        # → TURSO_DATABASE_URL
   turso db tokens create boardroom     # → TURSO_AUTH_TOKEN
   ```
   Put it in a region close to your Vercel functions (for example, AWS us-east-1 for Vercel's default `iad1`).
2. Apply the migrations. Run this again whenever `drizzle/` changes:
   ```bash
   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate
   ```
3. In Vercel, **Add New → Project** and import this GitHub repository. Next.js is detected automatically; use Node 22.
4. Add these environment variables for Production (and Preview, if you use it):

   | Variable | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://…` from step 1 |
   | `TURSO_AUTH_TOKEN` | Token from step 1 |
   | `RESEND_API_KEY` | Resend API key |
   | `MAIL_FROM` | Sender on a Resend-verified domain, e.g. `Boardroom <noreply@yourdomain.com>` |
   | `BOOTSTRAP_MASTER_EMAIL` | Email of the first Master |

5. Deploy, then follow **Before the event**.

## Local development

```bash
npm install
TURSO_DATABASE_URL=file:local.db npm run db:migrate
TURSO_DATABASE_URL=file:local.db BOOTSTRAP_MASTER_EMAIL=you@example.com npm run dev
```

Without Resend credentials, codes are not emailed and the Master console shows a delivery warning.

## Development checks

```bash
npm test
npm run lint
npm run build
```

The database schema and additive migrations live in `db/schema.ts` and `drizzle/`. Generate new migrations with `npm run db:generate`.
