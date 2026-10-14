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
- For now the two Master emails are hardcoded in `MASTER_EMAILS` (`lib/event-store.ts`). Only they can sign in on `/master`, with an email OTP that follows the same rules as Captains. Master sessions are rechecked against that list on every request.
- Exactly 30 active teams are required before Captain sign-in and the public display become live.
- A Captain enters the general `/team` URL, requests an email OTP, then enters the six-digit code. The app generates the codes, stores only their hashes in `login_codes`, and emails them through the Resend API. Codes are single-use, expire after 10 minutes, allow five failed attempts, and have a one-minute resend cooldown. Unknown emails receive the same generic response, and only addresses on the roster or Master list are emailed.
- Captain sessions use a secure, HTTP-only, 12-hour cookie and are rechecked against the roster on every request. A Captain can read or write only their own team.
- A Master can resend a Captain OTP, revoke all of a Captain's sessions, deactivate a team, or perform an audited emergency Captain transfer. A transfer immediately revokes the previous Captain.
- The deployment must be kept access-restricted until the two Masters and all 30 Captain identities are configured. The app also keeps Captain and display services dormant until that configuration is complete.

## Before the event

1. Deploy to Vercel (see **Deploying to Vercel** below) with every environment variable set.
2. Open `/master`, sign in with a code sent to one of the two Master emails, and click **Configure secure event**. This creates the six fixed rounds.
3. In **Teams**, import the roster as `team name, table, captain name, captain email`. The console rejects duplicate Captain emails and Master/Captain overlap.
4. In **Questions**, load all six questions. Each needs exactly six options, three distinct Boardroom Choices, evidence for each choice, and the fixed six-minute submission duration.
5. Confirm the Master banner shows **2/2 Masters**, **30/30 teams**, and **6/6 rounds**. Only then make the Captain URL and `/display` reachable to the room.
6. Use **Resend OTP** in **Teams** to email a Captain a fresh code; QR cards must point only to the general `/team` sign-in URL.

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

## Deploying: Supabase + Vercel

Supabase provides the Postgres database. The app sends the email sign-in codes itself through the Resend API. The app runs on Vercel.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick a region close to your Vercel functions, for example East US (N. Virginia) for Vercel's default `iad1`.
2. **Connect** (top bar) → copy two connection strings, replacing `[YOUR-PASSWORD]` with the database password:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`, which the app uses at runtime.
   - **Session pooler** (port 5432) → `DIRECT_URL`, which is used only for migrations.
3. Apply the database migrations. Run this again whenever `drizzle/` changes:
   ```bash
   DIRECT_URL=postgresql://…:5432/postgres npm run db:migrate
   ```
   Every table has row-level security turned on with no policies. Supabase's public REST API therefore cannot read or write game data; only the server's `DATABASE_URL` connection can.

### 2. Email codes (Resend)

1. In [Resend](https://resend.com), verify your sending domain and create an API key (`re_…`).
2. Use a sender on that domain for `RESEND_FROM_EMAIL`, e.g. `Boardroom Challenge <noreply@yourdomain.com>`.

### 3. Vercel

1. **Add New → Project** and import this repository. Next.js is detected automatically; use Node 22.
2. Add these environment variables for Production, and for Preview if you use it:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Transaction pooler string (port 6543) |
   | `RESEND_API_KEY` | Resend API key |
   | `RESEND_FROM_EMAIL` | Sender on your Resend-verified domain |

3. Deploy, then follow **Before the event**. Before inviting Captains, send yourself a test code to confirm Resend delivery.

## Local development

Use a separate Supabase project for development, so test sign-ins never touch the event database. Put its values in `.env.local`, which Git ignores:

```bash
DATABASE_URL=postgresql://…:6543/postgres
DIRECT_URL=postgresql://…:5432/postgres
RESEND_API_KEY=re_…
RESEND_FROM_EMAIL=Boardroom Challenge <noreply@yourdomain.com>
```

Then run:

```bash
npm install
npm run db:migrate
npm run dev
```

If the Resend variables are missing, no code is sent and the Master console shows a delivery warning.

## Development checks

```bash
npm test
npm run lint
npm run build
```

The Postgres schema lives in `db/schema.ts` and its migrations in `drizzle/`. After changing the schema, run `npm run db:generate`, then `npm run db:migrate`. Keep `.enableRLS()` on every new table.
