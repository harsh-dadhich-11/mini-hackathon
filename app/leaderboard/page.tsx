import { getPublicLeaderboard } from "@/lib/event-store";
import { LeaderboardClient } from "./leaderboard-client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  let initial = { label: "Leaderboard", entries: [] as { teamId: string; name: string; score: number; rank: number }[], publishedAt: null as string | null };
  try { initial = await getPublicLeaderboard(); } catch {}
  return <LeaderboardClient initial={initial} />;
}
