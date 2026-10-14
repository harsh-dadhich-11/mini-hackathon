import { cookies } from "next/headers";
import { audit, database, eventReady, normaliseEmail, requireMaster, type TeamRecord, type Viewer } from "@/lib/event-store";
import { sendCaptainAccessEmail } from "@/lib/mailer";
import { checkCode, claimCode, codeRecentlySent, discardCodes, INVALID_CODE, issueCode, sha256 } from "@/lib/otp";

export const CAPTAIN_COOKIE = "bc_captain";
export const SESSION_HOURS = 12;

export const now = () => new Date().toISOString();
export const later = (ms: number) => new Date(Date.now() + ms).toISOString();

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

/** Public request. Always succeeds from the caller's point of view, so it never reveals who is on the roster. */
export async function requestCaptainAccess(rawEmail: string) {
  if (!(await eventReady())) return;
  const email = normaliseEmail(rawEmail);
  const team = email ? await activeTeamByEmail(email) : null;
  if (!team) return;
  if (await codeRecentlySent(email)) return;
  const { code } = await issueCode(email);
  const result = await sendCaptainAccessEmail({ to: email, teamName: team.name, code });
  await audit(email, "captain.code_requested", team.id, { delivered: result.delivered });
}

export async function masterSendAccess(viewer: Viewer, teamId: string) {
  await requireMaster(viewer);
  if (!(await eventReady())) throw new Error("Add at least one active team before sending Captain access.");
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
    discardCodes(team.captainEmail),
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
