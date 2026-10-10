import { cookies } from "next/headers";
import { audit, database, eventReady, normaliseEmail, requireMaster, type TeamRecord, type Viewer } from "@/lib/event-store";
import { sendCaptainAccessEmail } from "@/lib/mailer";

export const CAPTAIN_COOKIE = "bc_captain";
export const SESSION_HOURS = 12;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

export const now = () => new Date().toISOString();
export const later = (ms: number) => new Date(Date.now() + ms).toISOString();

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

const TEAM_COLUMNS = "t.id, t.name, t.table_number AS tableNumber, t.captain_name AS captainName, t.captain_email AS captainEmail, t.is_active AS isActive";

async function activeTeamByEmail(email: string) {
  return database().prepare(`SELECT ${TEAM_COLUMNS} FROM teams t WHERE t.captain_email = ? AND t.is_active = 1`).bind(email).first<TeamRecord>();
}

async function activeTeamById(teamId: string) {
  const team = await database().prepare(`SELECT ${TEAM_COLUMNS} FROM teams t WHERE t.id = ?`).bind(teamId).first<TeamRecord>();
  if (!team) throw new Error("Team not found.");
  if (!team.isActive) throw new Error("This team is deactivated.");
  return team;
}

/** Replaces any earlier code for this email with a new six-digit single-use OTP. Shared by Captain and Master sign-in. */
export async function issueCode(email: string) {
  const code = randomCode();
  // `link_hash` remains populated for the additive legacy schema, but no magic-link sign-in is exposed.
  const unusedToken = randomToken();
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM captain_codes WHERE email = ? AND used_at IS NULL").bind(email),
    db.prepare("INSERT INTO captain_codes (id, email, code_hash, link_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .bind(crypto.randomUUID(), email, await sha256(code), await sha256(unusedToken), later(CODE_MINUTES * 60_000), now()),
  ]);
  return { code };
}

export async function codeRecentlySent(email: string) {
  const recent = await database().prepare("SELECT created_at AS createdAt FROM captain_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1").bind(email).first<{ createdAt: string }>();
  return Boolean(recent && Date.now() - Date.parse(recent.createdAt) < RESEND_COOLDOWN_MS);
}

/** Public request. Always succeeds from the caller's point of view, so it never reveals who is on the roster. */
export async function requestCaptainAccess(rawEmail: string) {
  if (!(await eventReady())) return;
  const email = normaliseEmail(rawEmail);
  const team = email ? await activeTeamByEmail(email) : null;
  if (!team) return;
  if (await codeRecentlySent(email)) return;
  const { code } = await issueCode(email);
  await sendCaptainAccessEmail({ to: email, teamName: team.name, code });
  await audit(email, "captain.code_requested", team.id, {});
}

export async function masterSendAccess(viewer: Viewer, teamId: string) {
  await requireMaster(viewer);
  if (!(await eventReady())) throw new Error("Finish the two-Master and 30-team roster before sending Captain access.");
  const team = await activeTeamById(teamId);
  const { code } = await issueCode(team.captainEmail);
  const result = await sendCaptainAccessEmail({ to: team.captainEmail, teamName: team.name, code });
  await audit(viewer.email, "captain.access_sent", team.id, { delivered: result.delivered });
  return result;
}

export async function masterRevokeAccess(viewer: Viewer, teamId: string) {
  await requireMaster(viewer);
  const db = database();
  const team = await db.prepare("SELECT captain_email AS captainEmail FROM teams WHERE id = ?").bind(teamId).first<{ captainEmail: string }>();
  if (!team) throw new Error("Team not found.");
  await db.batch([
    db.prepare("UPDATE captain_sessions SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL").bind(now(), teamId),
    db.prepare("DELETE FROM captain_codes WHERE email = ? AND used_at IS NULL").bind(team.captainEmail),
  ]);
  await audit(viewer.email, "captain.access_revoked", teamId, {});
}

async function createSession(team: TeamRecord) {
  const token = randomToken();
  const db = database();
  const timestamp = now();
  await db.batch([
    db.prepare("INSERT INTO captain_sessions (token_hash, team_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), team.id, team.captainEmail, timestamp, later(SESSION_HOURS * 3_600_000)),
    db.prepare("UPDATE teams SET last_sign_in_at = ? WHERE id = ?").bind(timestamp, team.id),
  ]);
  await audit(team.captainEmail, "captain.signed_in", team.id, {});
  return token;
}

export const INVALID_CODE = "That code is not valid. Check it, or request a new one.";

/** Matches the newest unexpired, unused code for this email; a wrong code counts as a failed attempt. Returns the code id. */
export async function checkCode(email: string, rawCode: string) {
  const code = rawCode.replace(/\D/g, "");
  const db = database();
  const row = await db.prepare(
    "SELECT id, code_hash AS codeHash, attempts FROM captain_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, now()).first<{ id: string; codeHash: string; attempts: number }>();
  if (!row || row.attempts >= MAX_ATTEMPTS) throw new Error(INVALID_CODE);
  if (row.codeHash !== await sha256(code)) {
    await db.prepare("UPDATE captain_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw new Error(INVALID_CODE);
  }
  return row.id;
}

/** Marks a code used exactly once, so two concurrent verifications can't both succeed. */
export async function claimCode(codeId: string) {
  const claimed = await database().prepare("UPDATE captain_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now(), codeId).run();
  if (!claimed.meta.changes) throw new Error(INVALID_CODE);
}

export async function verifyCaptainCode(rawEmail: string, rawCode: string) {
  const email = normaliseEmail(rawEmail);
  const codeId = await checkCode(email, rawCode);
  const team = await activeTeamByEmail(email);
  if (!team) throw new Error(INVALID_CODE);
  await claimCode(codeId);
  return createSession(team);
}

/**
 * The Captain's team for this request. A session only counts while it is unexpired, unrevoked,
 * the team is active and the team's Captain email is still the one that signed in.
 */
export async function getCaptainTeam() {
  if (!(await eventReady())) return null;
  const token = (await cookies()).get(CAPTAIN_COOKIE)?.value;
  if (!token) return null;
  return database().prepare(
    `SELECT ${TEAM_COLUMNS} FROM captain_sessions s JOIN teams t ON t.id = s.team_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND t.is_active = 1 AND t.captain_email = s.email`,
  ).bind(await sha256(token), now()).first<TeamRecord>();
}

export async function signOutCaptain() {
  const token = (await cookies()).get(CAPTAIN_COOKIE)?.value;
  if (!token) return;
  await database().prepare("UPDATE captain_sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
}

export function sessionCookie(token: string, request: Request, name = CAPTAIN_COOKIE) {
  return {
    name,
    value: token,
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}
