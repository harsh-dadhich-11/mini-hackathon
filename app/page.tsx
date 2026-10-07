"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Eye,
  Flag,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MonitorUp,
  Plus,
  Radio,
  ShieldCheck,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type View = "master" | "team" | "leaderboard";
type Mode = "top10" | "top5" | "top2";
type Team = {
  id: number;
  name: string;
  table: string;
  captain: string;
  email: string;
  score: number;
  rank: number;
  hue: string;
  finalist: boolean;
};

const seedTeams: Team[] = [
  { id: 1, name: "North Star", table: "T-04", captain: "Aarav Mehta", email: "aarav@northstar.team", score: 326, rank: 1, hue: "#dfb458", finalist: true },
  { id: 2, name: "Blue Peak", table: "T-12", captain: "Naina Shah", email: "naina@bluepeak.team", score: 312, rank: 2, hue: "#8ebbd7", finalist: true },
  { id: 3, name: "Onward", table: "T-18", captain: "Rohan Rao", email: "rohan@onward.team", score: 302, rank: 3, hue: "#e18160", finalist: true },
  { id: 4, name: "Redwood", table: "T-02", captain: "Sana Ali", email: "sana@redwood.team", score: 298, rank: 4, hue: "#cb7b76", finalist: true },
  { id: 5, name: "Vantage", table: "T-23", captain: "Ishaan Kapoor", email: "ishaan@vantage.team", score: 287, rank: 5, hue: "#9daa73", finalist: true },
  { id: 6, name: "Cobalt", table: "T-09", captain: "Maya Singh", email: "maya@cobalt.team", score: 276, rank: 6, hue: "#7683b9", finalist: false },
  { id: 7, name: "Field Notes", table: "T-16", captain: "Dev Malhotra", email: "dev@fieldnotes.team", score: 264, rank: 7, hue: "#c68b79", finalist: false },
  { id: 8, name: "Meridian", table: "T-07", captain: "Priya Bose", email: "priya@meridian.team", score: 253, rank: 8, hue: "#69a49e", finalist: false },
  { id: 9, name: "Sparrow", table: "T-29", captain: "Kabir Jain", email: "kabir@sparrow.team", score: 247, rank: 9, hue: "#cbb263", finalist: false },
  { id: 10, name: "Granite", table: "T-14", captain: "Riya Verma", email: "riya@granite.team", score: 239, rank: 10, hue: "#a49389", finalist: false },
];

const options = [
  ["A", "Freeze non-critical hiring and protect client delivery capacity."],
  ["B", "Accept the client escalation and reset the delivery plan together."],
  ["C", "Fund an AI accelerator with the remaining transformation budget."],
  ["D", "Move the decision to the next quarterly steering committee."],
  ["E", "Offer targeted retention grants for critical delivery roles."],
  ["F", "Open a rapid, cross-functional incident command room."],
  ["G", "Reduce the statement of work before discussing the relationship."],
  ["H", "Ask the board for an exception without a mitigation plan."],
] as const;

const schedule = [
  ["R1", "Business Pressure", "06:00–14:00"],
  ["R2", "Talent Bomb", "14:00–22:00"],
  ["R3", "Client Escalation", "22:00–30:00"],
  ["R4", "AI Disruption", "30:00–38:00"],
  ["TOP 5", "Qualification reveal", "38:00–41:00"],
  ["R5", "Security Incident", "41:00–50:00"],
];

function Avatar({ team, small = false }: { team: Team; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={"grid shrink-0 place-items-center rounded-full font-bold text-slate-950 " + (small ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm")}
      style={{ backgroundColor: team.hue }}
    >
      {team.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Ranking({ team, dark = false }: { team: Team; dark?: boolean }) {
  return (
    <div className={"grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b py-3.5 " + (dark ? "border-white/10" : "border-slate-100")}>
      <span className={"font-display text-xl font-bold " + (team.rank <= 3 ? "text-[#edc76e]" : dark ? "text-slate-300" : "text-slate-500")}>
        {String(team.rank).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar team={team} small />
        <div className="min-w-0">
          <p className={"truncate font-semibold " + (dark ? "text-white" : "text-slate-800")}>{team.name}</p>
          <p className={"text-xs " + (dark ? "text-slate-400" : "text-slate-500")}>{team.table}</p>
        </div>
      </div>
      <span className={"font-mono text-base font-bold " + (dark ? "text-white" : "text-slate-800")}>{team.score}</span>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("master");
  const [teams, setTeams] = useState<Team[]>(seedTeams);
  const [mode, setMode] = useState<Mode>("top10");
  const [seconds, setSeconds] = useState(300);
  const [email, setEmail] = useState("");
  const [captain, setCaptain] = useState<Team | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [newTeam, setNewTeam] = useState({ name: "", table: "", captain: "", email: "" });

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "master" || requested === "team" || requested === "leaderboard") setView(requested);
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const visibleTeams = useMemo(() => {
    const count = mode === "top10" ? 10 : mode === "top5" ? 5 : 2;
    return [...teams].sort((a, b) => a.rank - b.rank).slice(0, count);
  }, [mode, teams]);

  const countdown = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");

  function switchView(next: View) {
    setView(next);
    window.history.replaceState(null, "", "?view=" + next);
  }

  function signIn() {
    const match = teams.find((team) => team.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) {
      setNotice("That email is not assigned as a Captain yet. Ask the Master to add it.");
      return;
    }
    setCaptain(match);
    setNotice("");
  }

  function choose(letter: string) {
    setSubmitted(false);
    setPicks((current) => {
      if (current.includes(letter)) return current.filter((item) => item !== letter);
      return current.length === 3 ? current : [...current, letter];
    });
  }

  function addTeam() {
    if (!newTeam.name || !newTeam.table || !newTeam.captain || !newTeam.email) return;
    setTeams((current) => [
      ...current,
      {
        id: current.length + 1,
        name: newTeam.name,
        table: newTeam.table,
        captain: newTeam.captain,
        email: newTeam.email,
        score: 0,
        rank: current.length + 1,
        hue: "#74a6a2",
        finalist: false,
      },
    ]);
    setNewTeam({ name: "", table: "", captain: "", email: "" });
    setAddOpen(false);
    setNotice("Captain access created. The team can now sign in with this email.");
  }

  const viewButtons: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "master", label: "Master", icon: LayoutDashboard },
    { id: "team", label: "Team", icon: UsersRound },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  return (
    <main className={"min-h-screen " + (view === "leaderboard" ? "bg-[#06292c]" : "bg-[#eff4f2]")}>
      {view !== "leaderboard" && (
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f8fbf9]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
            <button onClick={() => switchView("master")} className="flex items-center gap-3 text-left">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#083f41] text-lg font-black text-[#f3c969]">B</span>
              <span><strong className="block font-display text-base tracking-tight text-[#073638]">BOARDROOM</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-slate-500">CHALLENGE CONTROL</span></span>
            </button>
            <nav className="hidden rounded-xl border border-slate-200 bg-white p-1 sm:flex" aria-label="Platform views">
              {viewButtons.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => switchView(id)} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition " + (view === id ? "bg-[#073f41] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </nav>
            <button onClick={() => switchView("leaderboard")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:text-[#0e6a68]"><MonitorUp size={16} /> <span className="hidden md:inline">Display</span></button>
          </div>
          <nav className="flex border-t border-slate-200 px-4 py-2 sm:hidden" aria-label="Platform views">
            {viewButtons.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => switchView(id)} className={"flex flex-1 items-center justify-center gap-1 rounded-lg px-1 py-2 text-sm font-semibold " + (view === id ? "bg-[#073f41] text-white" : "text-slate-600")}><Icon size={15} />{label}</button>)}
          </nav>
        </header>
      )}

      {view === "master" && (
        <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
          <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0e6a68]"><Radio size={15} fill="currentColor" /> Live command centre</p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c] sm:text-4xl">Run the room with clarity.</h1>
              <p className="mt-2 text-base text-slate-600">Captain access, fixed timing and the audience display in one event workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["top10", "top5", "top2"] as Mode[]).map((item) => (
                <button key={item} onClick={() => setMode(item)} className={"rounded-full px-4 py-2 text-sm font-semibold " + (mode === item ? "bg-[#083f41] text-white" : "border border-slate-300 bg-white text-slate-600 hover:border-[#0e6a68]")}>
                  Publish {item === "top10" ? "Top 10" : item === "top5" ? "Top 5" : "Top 2"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
            <div className="space-y-5">
              <section className="overflow-hidden rounded-2xl bg-[#073f41] text-white shadow-[0_16px_36px_rgba(5,54,56,0.16)]">
                <div className="flex flex-col justify-between gap-7 p-6 sm:flex-row sm:items-end sm:p-7">
                  <div><p className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#a8dcce]"><CircleDot size={16} /> Round 4 is live</p><h2 className="font-display text-3xl font-bold tracking-tight">AI Disruption</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#c6dbd7]">All teams are eligible. Current rankings determine the Top 5 official final scorecard.</p></div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-right"><p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#a8dcce]">Time remaining</p><p className="font-mono text-4xl font-bold">{countdown}</p></div>
                </div>
                <div className="grid grid-cols-3 border-t border-white/10 bg-black/10 text-center text-sm">
                  <div className="border-r border-white/10 py-3"><strong className="block text-lg">{teams.length}</strong><span className="text-[#b9ceca]">Teams ready</span></div>
                  <div className="border-r border-white/10 py-3"><strong className="block text-lg">24</strong><span className="text-[#b9ceca]">Submitted</span></div>
                  <div className="py-3"><strong className="block text-lg">08:00</strong><span className="text-[#b9ceca]">Fixed window</span></div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#0e6a68]">Captain access</p><h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Teams & sign-in</h2></div><button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#0d5c5c] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#073f41]"><Plus size={16} /> Add team</button></div>
                <Table>
                  <TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Captain</TableHead><TableHead>Email access</TableHead><TableHead>Access</TableHead></TableRow></TableHeader>
                  <TableBody>{teams.slice(0, 5).map((team) => <TableRow key={team.id}><TableCell><div className="flex items-center gap-2.5"><Avatar team={team} small /><span className="font-semibold">{team.name}</span></div></TableCell><TableCell className="text-slate-600">{team.captain}</TableCell><TableCell className="font-mono text-xs text-slate-500">{team.email}</TableCell><TableCell><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Check size={13} /> Enabled</span></TableCell></TableRow>)}</TableBody>
                </Table>
                <button onClick={() => setNotice("The final roster can be imported once team names and Captain emails are confirmed.")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0e6a68]">Manage all teams <ChevronRight size={16} /></button>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold text-[#0e6a68]">Published display</p><h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Current leaderboard</h2></div><button onClick={() => switchView("leaderboard")} className="rounded-lg p-2 text-[#0e6a68] hover:bg-[#e4f0ed]" aria-label="Open leaderboard"><ArrowUpRight size={18} /></button></div>
                <div className="mb-3 flex items-center justify-between rounded-xl bg-[#edf5f1] px-3 py-2 text-sm"><span className="font-semibold text-[#0b4c4b]">{mode === "top10" ? "Top 10 after R4" : mode === "top5" ? "Top 5 scorecard" : "Top 2 on stage"}</span><Eye size={16} className="text-[#0e6a68]" /></div>
                {visibleTeams.slice(0, 5).map((team) => <Ranking key={team.id} team={team} />)}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold text-[#0e6a68]">Fixed run of show</p><h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Schedule lock</h2></div><LockKeyhole size={19} className="text-slate-500" /></div>
                {schedule.slice(0, 5).map(([tag, title, range], index) => <div key={tag} className={"grid grid-cols-[45px_1fr] gap-3 border-b border-slate-100 py-3 last:border-0 " + (index === 3 ? "rounded-lg bg-[#eaf5ef] px-2" : "")}><span className={"self-start rounded-md px-1 py-1 text-center text-[10px] font-bold " + (index === 3 ? "bg-[#0d5c5c] text-white" : "bg-slate-100 text-slate-500")}>{tag}</span><div><p className="text-sm font-semibold text-slate-800">{title}</p><p className="font-mono text-xs text-slate-500">{range}</p></div></div>)}
              </section>
            </aside>
          </div>
        </section>
      )}

      {view === "team" && (
        <section className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
          {!captain ? (
            <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(18,61,62,0.10)] sm:p-8">
              <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#dff0eb] text-[#0b605c]"><KeyRound size={22} /></span>
              <p className="text-sm font-semibold text-[#0e6a68]">Captain sign-in</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#063a3c]">Welcome to your table.</h1>
              <p className="mt-3 text-base leading-7 text-slate-600">Use the email address the Master assigned to your team. Only Captains can lock in an answer.</p>
              <label className="mt-7 block text-sm font-semibold text-slate-700" htmlFor="email">Captain email</label>
              <div className="mt-2 flex gap-2"><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && signIn()} placeholder="captain@team.com" className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 outline-none focus:border-[#0e6a68] focus:ring-4 focus:ring-[#d6ebe5]" /><button onClick={signIn} className="rounded-xl bg-[#083f41] px-4 font-semibold text-white hover:bg-[#0d5c5c]">Continue</button></div>
              {notice && <p className="mt-3 text-sm font-medium text-rose-700">{notice}</p>}
              <div className="mt-7 rounded-xl bg-[#eff6f3] p-4 text-sm leading-6 text-slate-600"><ShieldCheck size={17} className="mr-2 inline text-[#0e6a68]" />Answers remain private until the Master publishes the official reveal.</div>
            </div>
          ) : (
            <div>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-semibold text-[#0e6a68]">{captain.name} · {captain.table}</p><h1 className="font-display text-3xl font-bold tracking-tight text-[#063a3c]">Round 4 · AI Disruption</h1></div><div className="rounded-2xl bg-[#083f41] px-5 py-3 text-right text-white"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#a8dcce]">Submit before</p><p className="font-mono text-2xl font-bold">{countdown}</p></div></div>
              {!captain.finalist && <div className="mb-5 flex gap-3 rounded-2xl border border-[#d8e8e0] bg-[#eaf5ef] p-4 text-sm leading-6 text-[#275c58]"><UsersRound className="mt-0.5 shrink-0" size={19} /><p><strong>Everyone plays on.</strong> Your team can submit in Round 5, but only the Top 5 after Round 4 appear on the official final scorecard.</p></div>}
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
                <div className="max-w-3xl border-b border-slate-200 pb-6"><p className="text-sm font-semibold text-[#0e6a68]">Decision brief</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">A major client asks for an AI-led recovery plan while delivery capacity is already under pressure.</h2><p className="mt-3 text-base leading-7 text-slate-600">Choose the three strongest actions in ranked order. Use your leadership lens, debate at the table, then lock in the team decision.</p></div>
                <div className="my-6 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold text-slate-700">Your ranking</span>{[0, 1, 2].map((index) => <span key={index} className={"inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-bold " + (picks[index] ? "border-[#0e6a68] bg-[#e3f2ee] text-[#075c58]" : "border-slate-200 bg-slate-50 text-slate-400")}><small>#{index + 1}</small>{picks[index] || "—"}</span>)}<button onClick={() => { setPicks([]); setSubmitted(false); }} className="ml-1 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</button></div>
                <div className="grid gap-3 sm:grid-cols-2">{options.map(([letter, copy]) => { const place = picks.indexOf(letter); return <button key={letter} onClick={() => choose(letter)} className={"group flex min-h-[92px] items-start gap-4 rounded-2xl border p-4 text-left transition " + (place >= 0 ? "border-[#0e6a68] bg-[#e5f3ef] shadow-sm" : "border-slate-200 hover:border-[#74a6a2] hover:bg-[#f7fbf9]")}><span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold " + (place >= 0 ? "bg-[#0d5c5c] text-white" : "bg-slate-100 text-slate-600")}>{place >= 0 ? "#" + (place + 1) : letter}</span><span className="pr-1 text-sm leading-6 text-slate-700">{copy}</span></button>; })}</div>
                <div className="mt-7 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center"><p className="text-sm text-slate-500">One answer per team. You may update it until time expires.</p><button disabled={picks.length !== 3 || submitted} onClick={() => setSubmitted(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5c5c] disabled:cursor-not-allowed disabled:bg-slate-300">{submitted ? <><Check size={17} /> Answer locked in</> : <>Submit ranked answer <ChevronRight size={17} /></>}</button></div>
              </section>
            </div>
          )}
        </section>
      )}

      {view === "leaderboard" && (
        <section className="min-h-screen bg-[#06292c] text-white">
          <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-10 lg:py-10">
            <header className="mb-8 flex items-center justify-between"><button onClick={() => switchView("master")} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8b85b] text-lg font-black text-[#073638]">B</span><span className="text-left"><strong className="block font-display text-base tracking-tight">BOARDROOM</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-[#9cc3bd]">PARTNER SUMMIT · DAY 2</span></span></button><span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-[#c3dcd7]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#f4c866]" /> LIVE · ROUND 4</span></header>
            <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto]"><div><p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b8d8d1]">Leadership scoreboard</p><h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{mode === "top10" ? "Top 10" : mode === "top5" ? "Top 5" : "Top 2"}<span className="text-[#e8b85b]">.</span></h1><p className="mt-4 max-w-xl text-lg text-[#c3dcd7]">{mode === "top10" ? "Standings after Round 4 · scores update on the official reveal." : mode === "top5" ? "Official final scorecard · the room continues to play." : "Finalists on stage · the finale begins next."}</p></div><div className="self-end rounded-2xl border border-white/15 bg-white/[0.06] px-7 py-5 text-right"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a9cbc4]">Round time</p><p className="font-mono text-4xl font-bold">{countdown}</p></div></div>
            <div className="grid flex-1 gap-x-14 lg:grid-cols-2">{visibleTeams.map((team) => <Ranking key={team.id} team={team} dark />)}</div>
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-sm text-[#a9cbc4]"><span className="inline-flex items-center gap-2"><Gauge size={16} /> Speed does not affect score</span><span className="inline-flex items-center gap-2"><Flag size={16} /> Scores verified by the Score Controller</span></footer>
          </div>
        </section>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm font-semibold text-[#0e6a68]">Captain access</p><h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Add a team</h2></div><button onClick={() => setAddOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <div className="space-y-3">
              {[["Team name", "name", "e.g. Keystone"], ["Table", "table", "e.g. T-30"], ["Captain name", "captain", "Captain's full name"], ["Captain email", "email", "captain@company.com"]].map(([label, key, placeholder]) => <label key={key} className="block text-sm font-semibold text-slate-700">{label}<input value={newTeam[key as keyof typeof newTeam]} onChange={(event) => setNewTeam({ ...newTeam, [key]: event.target.value })} type={key === "email" ? "email" : "text"} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-[#0e6a68] focus:ring-4 focus:ring-[#d6ebe5]" /></label>)}
            </div>
            <div className="mt-6 flex justify-end gap-2"><button onClick={() => setAddOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={addTeam} className="inline-flex items-center gap-2 rounded-lg bg-[#083f41] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d5c5c]"><Mail size={16} /> Add access</button></div>
          </div>
        </div>
      )}

      {notice && view === "master" && <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-[#cde1d9] bg-white p-4 text-sm text-slate-700 shadow-xl"><Clock3 className="mt-0.5 shrink-0 text-[#0e6a68]" size={18} /><p>{notice}</p><button onClick={() => setNotice("")} className="ml-auto text-slate-400"><X size={16} /></button></div>}
    </main>
  );
}
