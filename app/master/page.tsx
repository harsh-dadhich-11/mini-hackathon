import { BoardroomNav } from "@/components/boardroom-nav";
import { CaptainSignIn, MASTER_COPY } from "@/app/team/captain-sign-in";
import { getMasterOverview, hasMasters } from "@/lib/event-store";
import { getMasterViewer } from "@/lib/master-auth";
import { SetupClient } from "./setup-client";
import { MasterClient } from "./master-client";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  // Only configured Masters (or the bootstrap email before setup) can hold a Master session.
  const user = await getMasterViewer();
  if (!user) {
    return (
      <main className="min-h-screen bg-[#eff4f2]">
        <BoardroomNav active="master" />
        <CaptainSignIn copy={MASTER_COPY} />
      </main>
    );
  }
  if (!(await hasMasters())) return <SetupClient viewerName={user.displayName} />;
  const overview = await getMasterOverview();
  return <MasterClient initial={overview} viewerName={user.displayName} />;
}
