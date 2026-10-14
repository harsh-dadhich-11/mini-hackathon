import { redirect } from "next/navigation";
import { getPublicDisplay } from "@/lib/event-store";
import { getMasterViewer } from "@/lib/master-auth";
import { LeaderboardClient, type PublicDisplay } from "../leaderboard/leaderboard-client";

export const dynamic = "force-dynamic";

/** Projector route. Masters only: it is opened on the stage laptop by a signed-in Master. */
export default async function DisplayPage() {
  if (!(await getMasterViewer())) redirect("/master");
  let initial: PublicDisplay = { mode: "idle", serverNow: new Date().toISOString(), revision: "0" };
  try { initial = await getPublicDisplay(); } catch {}
  return <LeaderboardClient initial={initial} />;
}
