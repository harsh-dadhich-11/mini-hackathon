import "server-only";
import { getMasterViewer } from "@/lib/auth/masterAuth";
import type { Viewer } from "@/types";

export async function currentViewer(): Promise<Viewer | null> {
  return getMasterViewer();
}
