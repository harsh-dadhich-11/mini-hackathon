"use client";

import { useEffect, useState } from "react";
import { Gauge, Trophy } from "lucide-react";
import Link from "next/link";

type Board = { label: string; entries: { teamId: string; name: string; score: number; rank: number }[]; publishedAt: string | null };

export function LeaderboardClient({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (response.ok) setBoard(await response.json() as Board);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);
  return <main className="min-h-screen bg-[#06292c] text-white"><div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-10 lg:py-10"><header className="mb-8 flex items-center justify-between"><Link href="/master" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8b85b] text-lg font-black text-[#073638]">B</span><span><strong className="block font-display text-base tracking-tight">BOARDROOM</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-[#9cc3bd]">PARTNER SUMMIT · DAY 2</span></span></Link><span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-[#c3dcd7]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#f4c866]" /> LIVE</span></header><div className="mb-8"><p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b8d8d1]"><Trophy size={16} /> Leadership scoreboard</p><h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{board.label}<span className="text-[#e8b85b]">.</span></h1><p className="mt-4 max-w-xl text-lg text-[#c3dcd7]">{board.publishedAt ? "Officially published scores only." : "Waiting for the Score Controller to publish the first standings."}</p></div>{board.entries.length ? <div className="grid flex-1 gap-x-14 lg:grid-cols-2">{board.entries.map((entry) => <div key={entry.teamId} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 py-5"><span className={"font-display text-2xl font-bold " + (entry.rank <= 3 ? "text-[#edc76e]" : "text-slate-300")}>{String(entry.rank).padStart(2, "0")}</span><p className="truncate text-lg font-semibold">{entry.name}</p><span className="font-mono text-lg font-bold">{entry.score}</span></div>)}</div> : <div className="grid flex-1 place-items-center rounded-3xl border border-dashed border-white/20 bg-white/[0.03] p-10 text-center"><div><p className="font-display text-2xl font-bold">No standings are visible yet.</p><p className="mt-2 text-[#c3dcd7]">Scores appear only after the Master publishes the official reveal.</p></div></div>}<footer className="mt-8 flex items-center gap-2 border-t border-white/10 pt-5 text-sm text-[#a9cbc4]"><Gauge size={16} /> Speed does not affect score · This display never includes team choices or submissions.</footer></div></main>;
}
