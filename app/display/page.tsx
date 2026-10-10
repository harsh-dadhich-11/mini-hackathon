import { getPublicDisplay } from "@/lib/event-store";
import { LeaderboardClient, type PublicDisplay } from "../leaderboard/leaderboard-client";

export const dynamic = "force-dynamic";

/** Public, display-only route. It polls the minimal server-curated screen state. */
export default async function DisplayPage() {
  let initial: PublicDisplay = { mode: "idle", serverNow: new Date().toISOString(), revision: "0" };
  try { initial = await getPublicDisplay(); } catch {}
  return <LeaderboardClient initial={initial} />;
}
