import { getPublicDisplay } from "@/lib/event-store";
import { LeaderboardClient, type PublicDisplay } from "./leaderboard-client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  let initial: PublicDisplay = { mode: "idle", serverNow: new Date().toISOString(), revision: "0" };
  try { initial = await getPublicDisplay(); } catch {}
  return <LeaderboardClient initial={initial} />;
}
