import "server-only";
import { database } from "@/lib/db/client";

/** Appends one row to the audit log: who did what, to which target, with any detail. */
export async function audit(actor: string, action: string, target: string, detail: unknown) {
  await database().prepare(
    "INSERT INTO audit_log (id, actor_email, action, target, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), actor, action, target, JSON.stringify(detail), new Date().toISOString()).run();
}
