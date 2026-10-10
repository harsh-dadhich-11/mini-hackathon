"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Display, MasterOverview } from "@/lib/event-store";

export type Overview = MasterOverview;
export type Round = Overview["rounds"][number];
export type Act = (payload: Record<string, unknown>, success?: string) => Promise<unknown>;
export type { Display };
export type TabProps = {
  overview: Overview;
  act: Act;
  busy: boolean;
  setNotice: (notice: { text: string; error?: boolean } | null) => void;
  /** Server clock minus this device's clock, in ms. */
  serverOffset: number;
};

export const inputClass = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0e6a68] focus:ring-2 focus:ring-[#0e6a68]/15";

export function Card({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>{eyebrow && <p className="text-sm font-semibold text-[#0e6a68]">{eyebrow}</p>}<h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

const variants = {
  primary: "bg-[#083f41] text-white hover:bg-[#0d5c5c] disabled:bg-slate-300",
  outline: "border border-[#0e6a68] text-[#0e6a68] hover:bg-[#eaf5ef] disabled:border-slate-200 disabled:text-slate-400",
  quiet: "border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40",
  danger: "border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40",
};

export function Btn({ variant = "quiet", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`} />;
}

const stateStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-500",
  open: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  closed: "bg-sky-100 text-sky-800",
  scored: "bg-violet-100 text-violet-800",
  revealed: "bg-[#e3f2ee] text-[#0b605c]",
};

export function StateBadge({ state }: { state: string }) {
  return <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (stateStyles[state] ?? stateStyles.draft)}>{state === "revealed" ? "published" : state}</span>;
}

export function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

export const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "—");

/** Emergency overrides need a reason for the audit log. */
export function askReason(what: string) {
  const reason = window.prompt(`Reason for ${what} (recorded in the audit log):`);
  return reason?.trim() ? reason.trim() : null;
}
