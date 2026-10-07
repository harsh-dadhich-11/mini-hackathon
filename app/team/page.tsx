import { KeyRound, ShieldCheck } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { getOpenRoundForTeam, getTeamForCaptain } from "@/lib/event-store";
import { TeamClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="min-h-screen bg-[#eff4f2]">
        <BoardroomNav active="team" />
        <section className="mx-auto max-w-md px-5 py-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_20px_50px_rgba(18,61,62,0.10)]">
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#dff0eb] text-[#0b605c]"><KeyRound size={22} /></span>
            <p className="text-sm font-semibold text-[#0e6a68]">Captain sign-in</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#063a3c]">Welcome to your table.</h1>
            <p className="mt-3 leading-7 text-slate-600">Sign in with the same email address the Master assigned to your team. The system checks this on the server for every submission.</p>
            <a href={chatGPTSignInPath("/team")} target="_top" className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0d5c5c]">Sign in as Captain</a>
          </div>
        </section>
      </main>
    );
  }
  const team = await getTeamForCaptain(user.email);
  if (!team) {
    return (
      <main className="min-h-screen bg-[#eff4f2]">
        <BoardroomNav active="team" />
        <section className="mx-auto max-w-xl px-5 py-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><ShieldCheck className="mb-5 text-[#0e6a68]" size={28} /><h1 className="font-display text-3xl font-bold text-[#063a3c]">Captain access is not assigned.</h1><p className="mt-3 leading-7 text-slate-600">Your signed-in email is not on the Captain roster. Ask a Master to add it before the event begins.</p></div>
        </section>
      </main>
    );
  }
  const round = await getOpenRoundForTeam();
  return <TeamClient team={{ name: team.name, tableNumber: team.tableNumber }} round={round} />;
}
