"use client";

import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { BoardroomNav } from "@/components/boardroom-nav";

export function SetupClient({ viewerName }: { viewerName: string }) {
  const [state, setState] = useState<"ready" | "working" | "error">("ready");
  const [message, setMessage] = useState("");
  async function bootstrap() {
    setState("working");
    const response = await fetch("/api/setup", { method: "POST" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setState("error"); setMessage(payload.error ?? "Setup failed."); return; }
    window.location.reload();
  }
  return (
    <main className="min-h-screen bg-[#eff4f2]">
      <BoardroomNav active="master" />
      <section className="mx-auto max-w-xl px-5 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(18,61,62,0.10)]"><span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#dff0eb] text-[#0b605c]"><LockKeyhole size={22} /></span><p className="text-sm font-semibold text-[#0e6a68]">Secure event setup</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#063a3c]">Configure the event.</h1><p className="mt-3 leading-7 text-slate-600">Signed in as {viewerName}. This one-time step creates the six-round schedule. Add the Captain roster and load the questions next.</p><div className="mt-6 rounded-xl bg-[#eff6f3] p-4 text-sm leading-6 text-slate-600"><ShieldCheck size={17} className="mr-2 inline text-[#0e6a68]" />The site remains private during initial setup. Do this before opening access to Captains.</div><button onClick={bootstrap} disabled={state === "working"} className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0d5c5c] disabled:bg-slate-300">{state === "working" ? "Configuring event…" : "Configure secure event"}</button>{state === "error" && <p className="mt-3 text-sm font-medium text-rose-700">{message}</p>}</div>
      </section>
    </main>
  );
}
