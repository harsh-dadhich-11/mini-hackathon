import { DisplayClient, DisplayLocked } from "@/components/display/DisplayClient";
import { canViewDisplay } from "@/lib/auth/displayAuth";
import { getPublicDisplay } from "@/lib/game/eventStore";

export const dynamic = "force-dynamic";

/** Projector route: open with a projector link from Screen control, or as a signed-in Master. */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  if (!(await canViewDisplay())) return <DisplayLocked invalidLink={link === "invalid"} />;
  return <DisplayClient initial={await getPublicDisplay()} />;
}
