import "server-only";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { later, now, randomToken } from "@/lib/auth/captainAuth";
import { getMasterViewer } from "@/lib/auth/masterAuth";
import { requireMaster } from "@/lib/auth/masters";
import { sha256 } from "@/lib/auth/otp";
import { database } from "@/lib/db/client";
import { UserError } from "@/lib/errors";
import type { Viewer } from "@/types";

/**
 * Projector links: view-only keys for the stage laptop, so the big screen never needs a Master session.
 * A key only unlocks the public display feed, which never contains an unrevealed answer key.
 */
export const DISPLAY_COOKIE = "bc_display";
export const DISPLAY_LINK_HOURS = 72;

export type DisplayLink = { id: string; label: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null };

export async function createDisplayLink(viewer: Viewer, rawLabel: string) {
  requireMaster(viewer);
  const label = rawLabel.trim().slice(0, 60) || "Stage projector";
  const key = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = later(DISPLAY_LINK_HOURS * 3_600_000);
  await database().prepare("INSERT INTO display_tokens (id, token_hash, label, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, await sha256(key), label, viewer.email, now(), expiresAt).run();
  await audit(viewer.email, "display.link_created", id, { label, expiresAt });
  // The raw key is returned once and never stored.
  return { id, key, label, expiresAt };
}

export async function revokeDisplayLink(viewer: Viewer, id: string) {
  requireMaster(viewer);
  const result = await database().prepare("UPDATE display_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now(), id).run();
  if (!result.meta.changes) throw new UserError("That projector link is already revoked.");
  await audit(viewer.email, "display.link_revoked", id, {});
}

export async function listDisplayLinks(): Promise<DisplayLink[]> {
  const rows = await database().prepare(
    "SELECT id, label, created_by AS createdBy, created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt FROM display_tokens ORDER BY created_at DESC LIMIT 20",
  ).all<DisplayLink>();
  return rows.results;
}

/** True if `key` is a live projector link. */
export async function isLiveDisplayKey(key: string) {
  if (!key) return false;
  const row = await database().prepare("SELECT id FROM display_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").bind(await sha256(key), now()).first();
  return Boolean(row);
}

/** The projector feed is open to a signed-in Master or a browser holding a live projector link. */
export async function canViewDisplay() {
  const key = (await cookies()).get(DISPLAY_COOKIE)?.value;
  if (key && await isLiveDisplayKey(key)) return true;
  return Boolean(await getMasterViewer());
}
