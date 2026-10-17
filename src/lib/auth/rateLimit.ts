import "server-only";
import { database, type Transaction } from "@/lib/db/client";

/**
 * Fixed-window counters kept in Postgres, so every serverless instance shares them.
 * One atomic upsert per hit: a window older than `windowSeconds` restarts at 1.
 */
export async function hit(key: string, windowSeconds: number, tx?: Transaction) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const statement = database().prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END
     RETURNING count`,
  ).bind(key, now.toISOString(), windowStart, windowStart);
  const row = tx ? await tx.first<{ count: number }>(statement) : await statement.first<{ count: number }>();
  return Number(row?.count ?? 1);
}

/** Hits in the current window without adding one. */
export async function peek(key: string, windowSeconds: number) {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const row = await database().prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start > ?").bind(key, windowStart).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function clear(keys: string[]) {
  if (!keys.length) return;
  await database().prepare(`DELETE FROM rate_limits WHERE key IN (${keys.map(() => "?").join(", ")})`).bind(...keys).run();
}

/** Keys currently at or over `limit` whose key starts with `prefix`, with the prefix removed. */
export async function overLimit(prefix: string, windowSeconds: number, limit: number) {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const rows = await database().prepare("SELECT key FROM rate_limits WHERE key LIKE ? AND window_start > ? AND count >= ?")
    .bind(`${prefix}%`, windowStart, limit).all<{ key: string }>();
  return rows.results.map((row) => row.key.slice(prefix.length));
}

/** The caller's address as Vercel reports it. Only used to slow down floods, never to identify anyone. */
export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
