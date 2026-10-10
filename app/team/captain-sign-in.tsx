"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";

type Copy = { apiBase: string; label: string; headline: string; intro: string; footer: string };

const CAPTAIN_COPY: Copy = {
  apiBase: "/api/captain",
  label: "Captain sign-in",
  headline: "Welcome to your table.",
  intro: "Use the Captain email from your roster. We'll send a single-use six-digit sign-in code.",
  footer: "No code? Raise your table's flag card and a volunteer will help.",
};

export const MASTER_COPY: Copy = {
  apiBase: "/api/master-auth",
  label: "Master sign-in",
  headline: "Event control is restricted.",
  intro: "Use your Master email. We'll send a single-use six-digit sign-in code.",
  footer: "Only the configured Master accounts can sign in here.",
};

/** Email OTP sign-in card, shared by Captains (default) and Masters. */
export function CaptainSignIn({ copy = CAPTAIN_COPY }: { copy?: Copy }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    const response = await fetch(`${copy.apiBase}/request-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = await response.json() as { message?: string };
    setBusy(false);
    setStep("code");
    setMessage(payload.message ?? "Check your inbox for a 6-digit code.");
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`${copy.apiBase}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
    const payload = await response.json() as { error?: string };
    if (response.ok) { window.location.reload(); return; }
    setBusy(false);
    setMessage(payload.error ?? "That code didn't work.");
  }

  return (
    <section className="mx-auto max-w-md px-5 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_20px_50px_rgba(18,61,62,0.10)]">
        <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#dff0eb] text-[#0b605c]">{step === "email" ? <Mail size={22} /> : <KeyRound size={22} />}</span>
        <p className="text-sm font-semibold text-[#0e6a68]">{copy.label}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#063a3c]">{step === "email" ? copy.headline : "Enter your code."}</h1>
        {step === "email" ? (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <p className="leading-7 text-slate-600">{copy.intro}</p>
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-[#0e6a68] focus:ring-2 focus:ring-[#0e6a68]/20" />
            <button disabled={busy || !email} className="inline-flex w-full items-center justify-center rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0d5c5c] disabled:bg-slate-300">{busy ? "Sending…" : "Send my code"}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4">
            <p className="leading-7 text-slate-600">Sent to <strong>{email}</strong>. Enter the six-digit code from the email.</p>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-[#0e6a68] focus:ring-2 focus:ring-[#0e6a68]/20" />
            <button disabled={busy || code.replace(/\D/g, "").length !== 6} className="inline-flex w-full items-center justify-center rounded-xl bg-[#083f41] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0d5c5c] disabled:bg-slate-300">{busy ? "Checking…" : "Sign in"}</button>
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <button type="button" onClick={() => { setStep("email"); setCode(""); setMessage(""); }} className="hover:text-slate-800">Use a different email</button>
              <button type="button" disabled={busy} onClick={() => requestCode()} className="hover:text-slate-800">Resend code</button>
            </div>
          </form>
        )}
        {message && <p className="mt-4 text-sm leading-6 text-slate-600" role="status">{message}</p>}
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{copy.footer}</p>
      </div>
    </section>
  );
}
