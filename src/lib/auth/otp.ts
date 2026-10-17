import "server-only";
import { database } from "@/lib/db/client";
import { UserError } from "@/lib/errors";
import { clear, hit, peek } from "@/lib/auth/rateLimit";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;
const HOUR = 3600;

/**
 * Brute-force limits. Each code is bound to the browser that asked for it (an HttpOnly challenge cookie), so a
 * stranger who knows someone's email can neither use nor burn that person's code. Codes, attempts and failures are
 * capped per browser and per email; the per-network caps are generous because every Captain at the venue may share
 * one Wi-Fi address. A fresh browser's first guess is never blocked by the email-wide lock, so nobody can lock a
 * Master or Captain out remotely: they request a new code and sign in.
 */
export const OTP_LIMITS = {
  codesPerBrowserPerHour: 5,
  codesPerEmailPerHour: 30,
  failuresPerEmailPerHour: 50,
  codeRequestsPerIpPer10Min: 100,
  failuresPerIpPer10Min: 60,
};

const sendKey = (email: string) => `otp-send:${email}`;
const browserSendKey = (email: string, challengeId: string) => `otp-send-b:${email}:${challengeId}`;
const failKey = (email: string) => `otp-fail:${email}`;
const browserFailKey = (challengeId: string) => `otp-fail-b:${challengeId}`;
export const LOCK_PREFIX = "otp-fail:";
export const CHALLENGE_COOKIE = "bc_otp";
export const CHALLENGE_MINUTES = 30;

export const INVALID_CODE = "That code is not valid. Check it, or request a new one.";
export const LOCKED = "Too many wrong codes. Request a new code and try again.";

/** A fresh, unguessable id for the sign-in challenge cookie. */
export function newChallengeId() {
  return [...crypto.getRandomValues(new Uint8Array(18))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A challenge id from a cookie, or null if it isn't one we would have issued. */
export function cleanChallengeId(value: string | undefined | null) {
  return value && /^[0-9a-f]{36}$/.test(value) ? value : null;
}

/** Compares two equal-length hex digests without leaking where they differ. */
function sameDigest(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

const now = () => new Date().toISOString();

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

/**
 * Issues a new six-digit single-use OTP for this email, bound to the requesting browser's challenge (null for a code
 * a Master sent, which works from any browser). It replaces only that browser's earlier code, so someone else asking
 * for a code to the same email never cancels yours. Requests for one email are serialised. Returns null (and sends
 * nothing) inside the one-minute cooldown or past the hourly caps, unless a Master asked for the code.
 */
export async function issueCode(email: string, { byMaster = false, challengeId = null as string | null } = {}) {
  const db = database();
  return db.transaction(async (tx) => {
    await tx.run(db.prepare("SELECT pg_advisory_xact_lock(hashtext(?))").bind(`otp:${email}`));
    if (!byMaster) {
      if (!challengeId) return null;
      const recent = await tx.first<{ createdAt: string }>(db.prepare("SELECT created_at AS createdAt FROM login_codes WHERE email = ? AND challenge_id = ? ORDER BY created_at DESC LIMIT 1").bind(email, challengeId));
      if (recent && Date.now() - Date.parse(recent.createdAt) < RESEND_COOLDOWN_MS) return null;
      if (await hit(browserSendKey(email, challengeId), HOUR, tx) > OTP_LIMITS.codesPerBrowserPerHour) return null;
      if (await hit(sendKey(email), HOUR, tx) > OTP_LIMITS.codesPerEmailPerHour) return null;
    }
    const code = randomCode();
    const codeId = crypto.randomUUID();
    await tx.run(byMaster
      ? db.prepare("DELETE FROM login_codes WHERE email = ? AND used_at IS NULL AND challenge_id IS NULL").bind(email)
      : db.prepare("DELETE FROM login_codes WHERE email = ? AND used_at IS NULL AND challenge_id = ?").bind(email, challengeId));
    await tx.run(db.prepare("INSERT INTO login_codes (id, email, code_hash, challenge_id, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .bind(codeId, email, await sha256(code), byMaster ? null : challengeId, new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), now()));
    return { codeId, code };
  });
}

/** Deletes a code whose email never went out, so the Captain isn't stuck waiting out the cooldown for nothing. */
export async function discardCode(codeId: string) {
  await database().prepare("DELETE FROM login_codes WHERE id = ? AND used_at IS NULL").bind(codeId).run();
}

/** Drops any unused code for this email, e.g. when a Captain is revoked or replaced. */
export function discardCodes(email: string) {
  return database().prepare("DELETE FROM login_codes WHERE email = ? AND used_at IS NULL").bind(email);
}

/**
 * Matches the newest unexpired, unused code for this email that belongs to this browser (or was sent by a Master).
 * The attempt is counted in the same statement that reads the code, so parallel guesses can't get past the
 * five-attempt limit. Returns the code id.
 */
export async function checkCode(email: string, rawCode: string, ip: string, challengeId: string | null) {
  const [emailFailures, browserFailures, ipFailures] = await Promise.all([
    peek(failKey(email), HOUR),
    challengeId ? peek(browserFailKey(challengeId), HOUR) : Promise.resolve(0),
    peek(`otp-fail-ip:${ip}`, 600),
  ]);
  if (ipFailures >= OTP_LIMITS.failuresPerIpPer10Min) throw new UserError("Too many sign-in attempts from this network. Wait a few minutes and try again.", 429);
  if (browserFailures >= MAX_ATTEMPTS) throw new UserError(LOCKED, 429);
  // The email-wide lock never blocks a browser's first guess, so a stranger guessing can't lock the real person out.
  if (emailFailures >= OTP_LIMITS.failuresPerEmailPerHour && (browserFailures > 0 || !challengeId)) throw new UserError(LOCKED, 429);
  const code = rawCode.replace(/\D/g, "").slice(0, 6);
  const row = await database().prepare(
    `UPDATE login_codes SET attempts = attempts + 1
     WHERE id = (SELECT id FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? AND (challenge_id = ? OR challenge_id IS NULL) ORDER BY created_at DESC LIMIT 1)
       AND attempts < ?
     RETURNING id, code_hash AS codeHash`,
  ).bind(email, now(), challengeId ?? "", MAX_ATTEMPTS).first<{ id: string; codeHash: string }>();
  if (!row || !sameDigest(row.codeHash, await sha256(code))) {
    await Promise.all([hit(failKey(email), HOUR), hit(`otp-fail-ip:${ip}`, 600), challengeId ? hit(browserFailKey(challengeId), HOUR) : null]);
    throw new UserError(INVALID_CODE);
  }
  return row.id;
}

/** Marks a code used exactly once, so two concurrent verifications can't both succeed. */
export async function claimCode(codeId: string) {
  const claimed = await database().prepare("UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now(), codeId).run();
  if (!claimed.meta.changes) throw new UserError(INVALID_CODE);
}

/** Counts a code request from one network address. True while it is under the flood limit; false (fail closed) if the count can't be read. */
export async function allowCodeRequest(ip: string) {
  return hit(`otp-ip:${ip}`, 600).then((count) => count <= OTP_LIMITS.codeRequestsPerIpPer10Min, () => false);
}

/** Drops expired rate-limit windows so random emails can't grow the table for ever. Run occasionally. */
export async function pruneRateLimits() {
  await database().prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(new Date(Date.now() - 2 * HOUR * 1000).toISOString()).run();
}

/** Clears an email's sign-in lock and hourly code cap (Master action). */
export async function resetSignInLock(email: string) {
  await clear([failKey(email), sendKey(email)]);
}
