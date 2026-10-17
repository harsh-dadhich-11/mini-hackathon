import { MASTER_COPY, SignInCard } from "@/components/auth/SignInCard";
import { MasterClient } from "@/components/master/MasterClient";
import { SetupClient } from "@/components/master/SetupClient";
import { Navbar } from "@/components/Navbar";
import { getMasterViewer } from "@/lib/auth/masterAuth";
import { eventConfigured, getMasterOverview } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  // Only the configured Master emails can hold a Master session.
  const user = await getMasterViewer();
  if (!user) {
    return (
      <main className="min-h-screen bg-surface">
        <Navbar active="master" />
        <SignInCard copy={MASTER_COPY} />
      </main>
    );
  }
  if (!(await eventConfigured())) return <SetupClient viewerName={user.displayName} />;
  return <MasterClient initial={await getMasterOverview()} viewerName={user.displayName} />;
}
