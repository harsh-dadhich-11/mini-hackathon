import { SignInCard } from "@/components/auth/SignInCard";
import { Navbar } from "@/components/Navbar";
import { TeamClient } from "@/components/team/TeamClient";
import { getCaptainTeam } from "@/lib/auth/captainAuth";
import { getTeamState } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const team = await getCaptainTeam();
  if (!team) {
    return (
      <main className="min-h-screen bg-surface">
        <Navbar active="team" />
        <SignInCard />
      </main>
    );
  }
  return <TeamClient initial={await getTeamState(team)} />;
}
