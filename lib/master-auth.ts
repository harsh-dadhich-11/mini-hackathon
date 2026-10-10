import { cookies } from "next/headers";
import { checkCode, claimCode, codeRecentlySent, INVALID_CODE, issueCode, later, now, randomToken, SESSION_HOURS, sha256 } from "@/lib/captain-auth";
import { audit, database, hasMasters, normaliseEmail, type Viewer } from "@/lib/event-store";
import { sendMasterAccessEmail } from "@/lib/mailer";

export const MASTER_COOKIE = "bc_master";

/** Before any Master exists, only BOOTSTRAP_MASTER_EMAIL may sign in, and it becomes the first Master at setup. */
function bootstrapEmail() {
  return normaliseEmail(process.env.BOOTSTRAP_MASTER_EMAIL ?? "");
}

/** The display name for a permitted Master email, or null when the email may not sign in. */
async function masterName(email: string) {
  const master = await database().prepare("SELECT display_name AS displayName FROM masters WHERE email = ?").bind(email).first<{ displayName: string }>();
  if (master) return master.displayName;
  if (email && email === bootstrapEmail() && !(await hasMasters())) return email;
  return null;
}

/** Public request. Always succeeds from the caller's point of view, so it never reveals who is a Master. */
export async function requestMasterAccess(rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  if (!email || !(await masterName(email))) return;
  if (await codeRecentlySent(email)) return;
  const { code } = await issueCode(email);
  await sendMasterAccessEmail({ to: email, code });
  await audit(email, "master.code_requested", email, {});
}

export async function verifyMasterCode(rawEmail: string, rawCode: string) {
  const email = normaliseEmail(rawEmail);
  const codeId = await checkCode(email, rawCode);
  if (!(await masterName(email))) throw new Error(INVALID_CODE);
  await claimCode(codeId);
  const token = randomToken();
  await database().prepare("INSERT INTO master_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), email, now(), later(SESSION_HOURS * 3_600_000)).run();
  await audit(email, "master.signed_in", email, {});
  return token;
}

/** The signed-in Master for this request. The session is rechecked against the Master list on every request. */
export async function getMasterViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(MASTER_COOKIE)?.value;
  if (!token) return null;
  const session = await database().prepare("SELECT email FROM master_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?")
    .bind(await sha256(token), now()).first<{ email: string }>();
  if (!session) return null;
  const displayName = await masterName(session.email);
  return displayName ? { email: session.email, displayName } : null;
}

export async function signOutMaster() {
  const token = (await cookies()).get(MASTER_COOKIE)?.value;
  if (!token) return;
  await database().prepare("UPDATE master_sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
}
