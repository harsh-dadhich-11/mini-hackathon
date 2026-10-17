import "server-only";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { later, now, randomToken, SESSION_HOURS } from "@/lib/auth/captainAuth";
import { isMaster, normaliseEmail } from "@/lib/auth/masters";
import { checkCode, claimCode, discardCode, INVALID_CODE, issueCode, sha256 } from "@/lib/auth/otp";
import { database } from "@/lib/db/client";
import { sendMasterAccessEmail } from "@/lib/email/mailer";
import { UserError } from "@/lib/errors";
import type { Viewer } from "@/types";

export const MASTER_COOKIE = "bc_master";

/** Public request, run after the response is sent so its timing can't reveal who is a Master. */
export async function requestMasterAccess(rawEmail: string, challengeId: string) {
  const email = normaliseEmail(rawEmail);
  if (!email || !isMaster(email)) return;
  const issued = await issueCode(email, { challengeId });
  if (!issued) return;
  const result = await sendMasterAccessEmail({ to: email, code: issued.code });
  if (!result.delivered) await discardCode(issued.codeId);
  await audit(email, "master.code_requested", email, { delivered: result.delivered });
}

export async function verifyMasterCode(rawEmail: string, rawCode: string, ip: string, challengeId: string | null) {
  const email = normaliseEmail(rawEmail);
  const codeId = await checkCode(email, rawCode, ip, challengeId);
  if (!isMaster(email)) throw new UserError(INVALID_CODE);
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
  if (!session || !isMaster(session.email)) return null;
  return { email: session.email, displayName: session.email };
}

export async function signOutMaster() {
  const token = (await cookies()).get(MASTER_COOKIE)?.value;
  if (!token) return;
  await database().prepare("UPDATE master_sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
}

/** Ends every Master session everywhere (e.g. a laptop was left signed in). Everyone, including the caller, signs in again. */
export async function signOutAllMasters(viewer: Viewer) {
  if (!isMaster(viewer.email)) throw new UserError("Only a Master can do this.", 403);
  await database().prepare("UPDATE master_sessions SET revoked_at = ? WHERE revoked_at IS NULL").bind(now()).run();
  await audit(viewer.email, "master.sessions_revoked", "masters", {});
}
