# Boardroom Challenge

BOT Consulting's live game control for 30 Boardroom Challenge teams.

> **Running the event?** Read the [user guide](docs/USER_GUIDE.md): every screen, button and fix, for Masters and Captains.

It has three deliberately separate views:

| Route | Audience | What it can access |
|---|---|---|
| `/team` | One rostered Captain per team | Its own team, own answer, current question only |
| `/master` | The two named Masters | Rosters, questions, scoring, tie rulings and screen controls |
| `/display` | Projector, opened with a view-only projector link | Small, published screen state only; never emails, submissions, controls or unrevealed keys |

The site root `/` redirects to `/team`, so the deployment URL is the link to share with Captains. `/display` and its alias `/leaderboard` (and `/api/display`) need a projector link (created in **Screen control**) or a Master session. Without either they show a "not connected" screen, never a sign-in form.

## Security model

- Exactly two non-playing Master email accounts are permitted. A Master email cannot be a Captain email.
- For now the two Master emails are hardcoded in `MASTER_EMAILS` (`src/data/event.ts`). Only they can sign in on `/master`, with an email OTP that follows the same rules as Captains. Master sessions are rechecked against that list on every request.
- Captain sign-in and the display go live once at least one team is active (30 teams maximum).
- A Captain enters the general `/team` URL, requests an email OTP, then enters the six-digit code. The app generates the codes, stores only their hashes in `login_codes`, and emails them through the Resend API. Codes are single-use, expire after 10 minutes, allow five failed attempts, and have a one-minute resend cooldown. Each email gets at most five codes and fifteen wrong guesses per hour before it is locked (a Master can reset the lock in **Teams**). These limits live in Postgres, so they hold across every serverless instance. Code requests are answered before any lookup happens, so neither the response nor its timing reveals who is on the roster.
- Captain sessions use a secure, HTTP-only, 12-hour cookie and are rechecked against the roster on every request. A Captain can read or write only their own team.
- A Master can resend a Captain OTP, revoke all of a Captain's sessions, deactivate a team, or perform an audited emergency Captain transfer. A transfer immediately revokes the previous Captain.
- Captain screens show no links to `/master` or `/display`. A Master can delete a team only while it has no answers or scores; otherwise deactivate it.
- Answer keys never leave the server ahead of a reveal. Everything a Captain or the projector receives is built field by field in `src/lib/game/publicViews.ts`, and `publicViews.test.ts` checks that no answer key, evidence, email or other team's answer gets through. Server modules import `server-only`, so the build fails if one is ever pulled into a browser bundle.
- Projector links are view-only keys (only their SHA-256 is stored) that unlock nothing but the public display feed. They last 72 hours and can be revoked.
- Only messages written for users reach the browser. Database and other internal errors are logged on the server and answered with a generic message.
- Each sign-in code is bound to the browser that requested it (an HttpOnly `bc_otp` challenge cookie). A stranger who knows an email can't use or burn its codes, and a fresh browser's first guess is never blocked by the email-wide failure lock, so nobody can be locked out remotely. Emergency reset: `DIRECT_URL=… npm run unlock-signin -- <email>`.
- Every API write must be same-origin with a JSON body (`src/proxy.ts`, CSRF), and Captain saves are rate-limited per team.
- Security headers on every response (`next.config.ts`): a strict CSP, `frame-ancestors 'none'` and `X-Frame-Options: DENY`, nosniff, `no-referrer`, HSTS and a Permissions-Policy. APIs send `Cache-Control: no-store`.
- Database: TLS always. Set `DATABASE_CA_CERT` to Supabase's certificate to verify it as well. Pool and query timeouts, an 8 s `statement_timeout` set by migration 0005, and one retry for read-only queries on a dropped connection mean a stalled database fails fast and recovers by itself.

## Before the event

1. Deploy to Vercel (see **Deploying to Vercel** below) with every environment variable set.
2. Open `/master`, sign in with a code sent to one of the two Master emails, and click **Configure secure event**. This creates the six fixed rounds.
3. In **Teams**, import the roster as `team name, table, captain name, captain email`. The console rejects duplicate Captain emails and Master/Captain overlap.
4. In **Questions**, click **Load Summit question pack** (the reviewed content ships server-only in `src/data/questions.ts`), or edit or import the six questions. Each needs exactly six options, three distinct Boardroom Choices and the fixed six-minute submission duration. An event created on the earlier v4 schedule shows **Upgrade schedule** first.
5. Confirm the Master banner has cleared (at least one active team and every question loaded), then share the Captain URL. In **Screen control**, click **Create projector link** and open it on the projector laptop.
6. Use **Resend OTP** in **Teams** to email a Captain a fresh code; QR cards must point only to the general `/team` sign-in URL.

## Six-round run book

Each round has a six-minute, server-authoritative submission window inside its eight-minute show slot. Masters can pause, resume, lock/close or extend it; emergency controls require an audit reason.

| Moment | Master workflow | Display cue |
|---|---|---|
| Practice | Optional 2-minute round so every table tries the controls. Full reveal, then **Finish practice**. Never counts. | Question and reveal; back to welcome |
| Rounds 1–4 | Every team plays. Open, close, **score**, check **SCORES GREEN**, reveal #3 → #2 → #1 (drumroll and sting each) → principle, then **Publish Top 10** | Question with debate segments and countdown; cumulative Top 10 after each round |
| After R4 | Confirm Top 2 on the four-round total. A tie at the cutoff goes to a **sudden-death number question** on the tied teams' devices. | Top 2 reveal; hamper race Top 5 |
| Round 5 | The finalists play on their laptops; every other team keeps playing for the chocolate hamper. Score it, but **don't reveal it**. | Question/countdown only |
| Round 6 | Opens once Round 5 is scored. Score it, then reveal Round 5 and Round 6. | Both reveals |
| Awards | Confirm the winner (R5 + R6, scores reset) and the hamper (all six rounds, outside the Top 2), with sudden death for any tie; then step through the awards. | Chocolate hamper → runner-up → winner |

The projector has a game-show soundtrack (lobby, quiz bed, last-minute tension, ticks and buzzer, drumrolls, stings and fanfares), generated in the browser. Any cue can be replaced by an MP3 in `public/audio/`. Masters can switch music and effects off from **Screen control**.

## Scoring and auditability

- Each raw answer is stored for all six rounds; a non-submission is stored as zero when scoring runs.
- Boardroom Choices score 40 / 30 / 20 points. A team receives an additional 10 only when its first-ranked selection is Boardroom Choice #1. There are no multipliers.
- Rounds 1–4 decide the Top 2. Rounds 5–6 start from zero for the two finalists. The chocolate hamper is the highest raw six-round total outside the Top 2.
- Ties at a cutoff are decided by a multiple-choice sudden death (four options, only the right answer counts) played on the tied teams' devices; still-level teams replay another question. The picks become the recorded ruling, and a manual Game Jury ruling remains as a fallback.
- Closing a round only stops submissions. Points count after **Score round**, and the leaderboard updates on **Publish**. Every publish writes a fresh cumulative board, so **Republish correction** fixes the screen after any correction.
- Once the stage rounds start, Rounds 1–4 scores are locked because they decided the Top 2.
- Every score correction, answer-key correction, sudden death and tie ruling, Captain transfer, lock/timer change, display cue, projector link and paper answer records actor, timestamp and reason in **Audit log**.
- Paper slips remain the Wi-Fi fallback: select **Record paper answer**, enter the team and ranked choices, and record the reason before scoring.

## Deploying: Supabase + Vercel

Supabase provides the Postgres database. The app sends the email sign-in codes itself through the Resend API. The app runs on Vercel.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Keep it in the same region as the Vercel functions. This event uses Sydney (`ap-southeast-2`), and `vercel.json` pins functions to `syd1` to match; change both together.
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

1. **Add New → Project** and import this repository. Next.js is detected automatically; use Node 22. The function region comes from `vercel.json` (`syd1`).
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

The Postgres schema lives in `src/lib/db/schema.ts` and its migrations in `drizzle/`. After changing the schema, run `npm run db:generate`, then `npm run db:migrate`. Keep `.enableRLS()` on every new table.

## Project structure

The layout follows BOT Consulting's Partner Summit site:

```
src/
  app/                 Routes only: pages and API route handlers (`/team`, `/master`, `/display`, `/api/**`)
  components/
    Navbar.tsx         Teal brand bar
    auth/              Email-code sign-in card (Captains and Masters)
    team/              Captain game screen
    master/            Event control: one file per tab
    display/           Projector screen
    ui/                Brand primitives: Button, Card, Notice, StateBadge, Logo, Mascot
  data/
    brand.ts           Public display strings
    event.ts           Server-only config: Master emails, round schedule, stage sizes
  lib/
    auth/              OTP, sessions, rate limits, projector links
    db/                Postgres client and Drizzle schema
    email/             Resend mailer
    game/              Event store, scoring, public views (+ tests)
    hooks/             Polling and server-clock hooks
  types/               Shared game types
public/brand/          BOT logo (light/dark) and owl mascot
docs/USER_GUIDE.md     How to run the event
```

Colours, fonts and radii are BOT brand tokens in `src/app/globals.css`. `npm run lint` rejects default Tailwind colours, hard-coded hex classes and gradients, so new UI stays on brand.
