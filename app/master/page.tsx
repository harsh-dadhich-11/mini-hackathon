import { ShieldAlert } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { getMasterOverview, hasMasters, isMaster } from "@/lib/event-store";
import { SetupClient } from "./setup-client";
import { MasterClient } from "./master-client";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  const user = await requireChatGPTUser("/master");
  if (!(await hasMasters())) return <SetupClient viewerName={user.displayName} />;
  if (!(await isMaster(user.email))) {
    return (
      <main className="min-h-screen bg-[#eff4f2]">
        <BoardroomNav active="master" />
        <section className="mx-auto max-w-xl px-5 py-12"><div className="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm"><ShieldAlert className="mb-5 text-rose-700" size={28} /><h1 className="font-display text-3xl font-bold text-[#063a3c]">Master access is required.</h1><p className="mt-3 leading-7 text-slate-600">This account is not one of the two configured Master accounts. A Master can add you from the secure Master workspace.</p></div></section>
      </main>
    );
  }
  const overview = await getMasterOverview();
  return <MasterClient initial={overview} viewerName={user.displayName} />;
}
