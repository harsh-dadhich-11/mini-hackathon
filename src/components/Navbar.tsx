import Link from "next/link";
import { LayoutDashboard, MonitorUp, UsersRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

/** Teal brand bar. Captains only see the brand; the console and projector links are for Masters. */
export function Navbar({ active }: { active: "master" | "team" }) {
  const isMaster = active === "master";
  const link = "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors";
  return (
    <header className="sticky top-0 z-40 border-b border-rule-light bg-teal-dark/95 text-cream backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href={isMaster ? "/master" : "/team"} className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Logo className="h-7 sm:h-8" />
          <span className="hidden h-7 w-px bg-rule-light sm:block" aria-hidden />
          <span className="hidden min-w-0 sm:block">
            <strong className="block truncate font-display text-sm text-cream">Boardroom Challenge</strong>
            <span className="kicker block text-cyan-soft">{isMaster ? "Event control" : "Captain"}</span>
          </span>
        </Link>
        {isMaster && (
          <nav className="flex items-center gap-1" aria-label="Platform views">
            <Link href="/master" className={cn(link, "bg-cream/10 text-cream")}><LayoutDashboard size={15} /> <span className="hidden sm:inline">Console</span></Link>
            <Link href="/team" className={cn(link, "text-cream/80 hover:text-cyan-bright")}><UsersRound size={15} /> <span className="hidden sm:inline">Captain view</span></Link>
            <Link href="/display" target="_blank" className={cn(link, "text-cream/80 hover:text-cyan-bright")}><MonitorUp size={15} /> <span className="hidden md:inline">Projector</span></Link>
          </nav>
        )}
      </div>
    </header>
  );
}
