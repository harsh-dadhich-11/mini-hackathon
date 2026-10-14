import Link from "next/link";
import { LayoutDashboard, MonitorUp, UsersRound } from "lucide-react";

/** Captains only see the brand; the Master and projector links are for Masters. */
export function BoardroomNav({ active }: { active: "master" | "team" }) {
  const isMaster = active === "master";
  return (
    <header className="border-b border-slate-200 bg-[#f8fbf9]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
        <Link href={isMaster ? "/master" : "/team"} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#083f41] text-lg font-black text-[#f3c969]">B</span>
          <span className="hidden sm:block"><strong className="block font-display text-base tracking-tight text-[#073638]">BOARDROOM</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-slate-500">{isMaster ? "CHALLENGE CONTROL" : "CAPTAIN"}</span></span>
        </Link>
        {isMaster && <>
          <nav className="flex rounded-xl border border-slate-200 bg-white p-1" aria-label="Platform views">
            <Link href="/master" className="flex items-center gap-2 rounded-lg bg-[#073f41] px-3 py-2 text-sm font-semibold text-white"><LayoutDashboard size={15} /> Master</Link>
            <Link href="/team" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><UsersRound size={15} /> Team</Link>
          </nav>
          <Link href="/display" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:text-[#0e6a68]"><MonitorUp size={16} /> <span className="hidden md:inline">Display</span></Link>
        </>}
      </div>
    </header>
  );
}
