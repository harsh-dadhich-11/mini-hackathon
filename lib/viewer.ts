import type { Viewer } from "@/lib/event-store";
import { getMasterViewer } from "@/lib/master-auth";

export async function currentViewer(): Promise<Viewer | null> {
  return getMasterViewer();
}
