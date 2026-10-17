"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/field";
import { Mascot } from "@/components/ui/Mascot";
import { postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type Copy = { apiBase: string; label: string; headline: string; intro: string; footer: string };

export const CAPTAIN_COPY: Copy = {
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

/** Email OTP sign-in, shared by Captains (default) and Masters. */
export function SignInCard({ copy = CAPTAIN_COPY }: { copy?: Copy }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    const result = await postJson<{ message?: string }>(`${copy.apiBase}/request-code`, { email });
    setBusy(false);
    if (!result.ok) { setMessage({ text: result.error, error: true }); return; }
    setStep("code");
    setMessage({ text: result.data.message ?? "Check your inbox for a six-digit code." });
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await postJson(`${copy.apiBase}/verify`, { email, code });
    if (result.ok) { window.location.reload(); return; }
    setBusy(false);
    setMessage({ text: result.error, error: true });
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-0 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-16">
      <div className="card-xl relative hidden overflow-hidden bg-teal-dark p-10 text-cream lg:flex lg:flex-col lg:justify-between lg:rounded-r-none">
        <div>
          <p className="kicker text-cyan-soft">BOT Consulting presents</p>
          <p className="mt-3 font-display text-h1 text-cream">The Boardroom<br />Challenge<span className="text-accent">.</span></p>
          <p className="mt-4 max-w-xs text-cream/70">Six rounds. Three ranked calls. One Boardroom.</p>
        </div>
        <Mascot className="h-56 self-end" />
      </div>

      <div className="card card-xl p-6 shadow-[0_20px_50px_rgba(24,57,68,0.10)] sm:p-9 lg:rounded-l-none lg:border-l-0">
        <div className="mb-6 flex items-center justify-between">
          <span className="tile grid h-12 w-12 place-items-center bg-panel-orange text-accent-deep">{step === "email" ? <Mail size={22} /> : <KeyRound size={22} />}</span>
          <Mascot className="h-16 lg:hidden" />
        </div>
        <p className="kicker text-teal-mid">{copy.label}</p>
        <h1 className="mt-2 font-display text-h2 text-ink">{step === "email" ? copy.headline : "Enter your code."}</h1>
        {step === "email" ? (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <p className="leading-7 text-muted">{copy.intro}</p>
            <label className="block text-sm font-medium text-ink">
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className={cn(inputClass, "mt-1.5 h-12 w-full text-base")} />
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={busy || !email} className="w-full">{busy ? "Sending…" : "Send my code"}</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4">
            <p className="leading-7 text-muted">Sent to <strong className="text-ink">{email}</strong>. Enter the six-digit code from the email.</p>
            <input aria-label="Six-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" className={cn(inputClass, "h-14 w-full text-center font-mono text-2xl tracking-[0.4em]")} />
            <Button type="submit" variant="primary" size="lg" disabled={busy || code.replace(/\D/g, "").length !== 6} className="w-full">{busy ? "Checking…" : "Sign in"}</Button>
            <div className="flex justify-between text-sm font-medium text-muted">
              <button type="button" onClick={() => { setStep("email"); setCode(""); setMessage(null); }} className="hover:text-ink">Use a different email</button>
              <button type="button" disabled={busy} onClick={() => requestCode()} className="hover:text-ink disabled:opacity-50">Resend code</button>
            </div>
          </form>
        )}
        {message && <p className={cn("mt-4 text-sm leading-6", message.error ? "font-medium text-danger" : "text-muted")} role="status">{message.text}</p>}
        <p className="mt-8 border-t border-rule pt-4 text-xs leading-5 text-muted">{copy.footer}</p>
      </div>
    </section>
  );
}
