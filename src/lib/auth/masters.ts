import "server-only";
import { MASTER_EMAILS } from "@/data/event";
import { UserError } from "@/lib/errors";
import type { Viewer } from "@/types";

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export function isMaster(email: string) {
  return MASTER_EMAILS.includes(normaliseEmail(email));
}

export function requireMaster(viewer: Viewer) {
  if (!isMaster(viewer.email)) throw new UserError("Master access is required.", 403);
}
