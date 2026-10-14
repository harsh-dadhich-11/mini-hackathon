import { cookies } from "next/headers";
import { later, now, randomToken, SESSION_HOURS } from "@/lib/captain-auth";
import { audit, database, isMaster, normaliseEmail, type Viewer } from "@/lib/event-store";
import { sendMasterAccessEmail } from "@/lib/mailer";
import { checkCode, claimCode, codeRecentlySent, INVALID_CODE, issueCode, sha256 } from "@/lib/otp";

export const MASTER_COOKIE = "bc_master";

/** Public request. Always succeeds from the caller's point of view, so it never reveals who is a Master. */
export async function requestMasterAccess(rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  if (!email || !(await isMaster(email))) return;
  if (await codeRecentlySent(email)) return;
  const { code } = await issueCode(email);
  const result = await sendMasterAccessEmail({ to: email, code });
  await audit(email, "master.code_requested", email, { delivered: result.delivered });
}

export async function verifyMasterCode(rawEmail: string, rawCode: string) {
  const email = normaliseEmail(rawEmail);
  const codeId = await checkCode(email, rawCode);
  if (!(await isMaster(email))) throw new Error(INVALID_CODE);
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
  if (!session || !(await isMaster(session.email))) return null;
  return { email: session.email, displayName: session.email };
}

export async function signOutMaster() {
  const token = (await cookies()).get(MASTER_COOKIE)?.value;
  if (!token) return;
  await database().prepare("UPDATE master_sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
}
