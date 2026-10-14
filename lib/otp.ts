import { database } from "@/lib/event-store";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

export const INVALID_CODE = "That code is not valid. Check it, or request a new one.";

const now = () => new Date().toISOString();

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

/** Replaces any earlier code for this email with a new six-digit single-use OTP. Shared by Captain and Master sign-in. */
export async function issueCode(email: string) {
  const code = randomCode();
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM login_codes WHERE email = ? AND used_at IS NULL").bind(email),
    db.prepare("INSERT INTO login_codes (id, email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(crypto.randomUUID(), email, await sha256(code), new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), now()),
  ]);
  return { code };
}

export async function codeRecentlySent(email: string) {
  const recent = await database().prepare("SELECT created_at AS createdAt FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1").bind(email).first<{ createdAt: string }>();
  return Boolean(recent && Date.now() - Date.parse(recent.createdAt) < RESEND_COOLDOWN_MS);
}

/** Drops any unused code for this email, e.g. when a Captain is revoked or replaced. */
export function discardCodes(email: string) {
  return database().prepare("DELETE FROM login_codes WHERE email = ? AND used_at IS NULL").bind(email);
}

/** Matches the newest unexpired, unused code for this email; a wrong code counts as a failed attempt. Returns the code id. */
export async function checkCode(email: string, rawCode: string) {
  const code = rawCode.replace(/\D/g, "");
  const db = database();
  const row = await db.prepare(
    "SELECT id, code_hash AS codeHash, attempts FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, now()).first<{ id: string; codeHash: string; attempts: number }>();
  if (!row || row.attempts >= MAX_ATTEMPTS) throw new Error(INVALID_CODE);
  if (row.codeHash !== await sha256(code)) {
    await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw new Error(INVALID_CODE);
  }
  return row.id;
}

/** Marks a code used exactly once, so two concurrent verifications can't both succeed. */
export async function claimCode(codeId: string) {
  const claimed = await database().prepare("UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now(), codeId).run();
  if (!claimed.meta.changes) throw new Error(INVALID_CODE);
}
