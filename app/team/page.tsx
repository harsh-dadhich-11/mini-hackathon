import { BoardroomNav } from "@/components/boardroom-nav";
import { getCaptainTeam } from "@/lib/captain-auth";
import { getTeamState } from "@/lib/event-store";
import { CaptainSignIn } from "./captain-sign-in";
import { TeamClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const team = await getCaptainTeam();
  if (!team) {
    return (
      <main className="min-h-screen bg-[#eff4f2]">
        <BoardroomNav active="team" />
        <CaptainSignIn />
      </main>
    );
  }
  return <TeamClient initial={await getTeamState(team)} />;
}
