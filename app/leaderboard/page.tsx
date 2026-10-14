import { redirect } from "next/navigation";
import { getPublicDisplay } from "@/lib/event-store";
import { getMasterViewer } from "@/lib/master-auth";
import { LeaderboardClient, type PublicDisplay } from "./leaderboard-client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  if (!(await getMasterViewer())) redirect("/master");
  let initial: PublicDisplay = { mode: "idle", serverNow: new Date().toISOString(), revision: "0" };
  try { initial = await getPublicDisplay(); } catch {}
  return <LeaderboardClient initial={initial} />;
}
