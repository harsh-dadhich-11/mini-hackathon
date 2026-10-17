"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Lock, Mail, Pencil, Plus, Trash2, Upload, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/field";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Act, TabProps } from "./types";

const blankTeam = { name: "", tableNumber: "", captainName: "", captainEmail: "" };
type TeamForm = typeof blankTeam;

function TeamFields({ value, onChange }: { value: TeamForm; onChange: (value: TeamForm) => void }) {
  return <>
    <input required aria-label="Team name" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Team name" className={inputClass} />
    <input required aria-label="Table" value={value.tableNumber} onChange={(event) => onChange({ ...value, tableNumber: event.target.value })} placeholder="Table" className={inputClass} />
    <input required aria-label="Captain name" value={value.captainName} onChange={(event) => onChange({ ...value, captainName: event.target.value })} placeholder="Captain name" className={inputClass} />
    <input required aria-label="Captain email" type="email" value={value.captainEmail} onChange={(event) => onChange({ ...value, captainEmail: event.target.value })} placeholder="Captain email" className={inputClass} />
  </>;
}

/** Shown next to an email that is locked out of sign-in after repeated wrong codes. */
function LockBadge({ email, act, busy }: { email: string; act: Act; busy: boolean }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-panel-danger px-2 py-0.5 text-[11px] font-semibold text-danger">
      <Lock size={11} /> Sign-in locked
      <button type="button" disabled={busy} onClick={() => window.confirm(`Reset the sign-in lock for ${email}? Do this once you've confirmed it's really them.`) && act({ action: "reset-sign-in-lock", email }, "Sign-in lock reset. They can request a new code now.")} className="underline disabled:opacity-50">Reset</button>
    </span>
  );
}

export function TeamsTab({ overview, act, busy, setNotice }: TabProps) {
  const [team, setTeam] = useState(blankTeam);
  const [csv, setCsv] = useState("");
  const [editing, setEditing] = useState<(TeamForm & { id: string }) | null>(null);
  const locked = new Set(overview.lockedEmails);

  async function addTeam(event: FormEvent) {
    event.preventDefault();
    if (await act({ action: "add-team", ...team }, `${team.name} added. Send their Captain access next.`) !== undefined) setTeam(blankTeam);
  }

  async function importCsv() {
    const result = await act({ action: "import-teams", csv }) as { added: number; errors: string[] } | undefined;
    if (!result) return;
    setNotice({ text: [`${result.added} team(s) imported.`, ...result.errors].join("\n"), error: result.errors.length > 0 });
    if (!result.errors.length) setCsv("");
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const previous = overview.teams.find((entry) => entry.id === editing.id);
    const emailChanged = previous && previous.captainEmail !== editing.captainEmail.trim().toLowerCase();
    if (emailChanged && !window.confirm("Emergency Captain transfer: the previous Captain is immediately signed out and the new named backup must request a fresh email OTP. Continue?")) return;
    if (await act({ action: emailChanged ? "transfer-captain" : "update-team", ...editing }, emailChanged ? "Captain access transferred and the old session revoked. The backup can now request their email OTP." : "Team updated.") !== undefined) setEditing(null);
  }

  async function sendAccess(teamId: string) {
    await act({ action: "send-access", id: teamId }, (result) => (result as { delivered?: boolean } | null)?.delivered ? "Fresh six-digit code sent to the rostered Captain." : null)
      .then((result) => {
        if (result && !(result as { delivered?: boolean }).delivered) setNotice({ text: "The email did not go out. Check RESEND_API_KEY and RESEND_FROM_EMAIL on the host.", error: true });
      });
  }

  function deleteTeam(entry: { id: string; name: string }) {
    if (window.confirm(`Permanently delete ${entry.name}? This only works for teams that have never submitted an answer.`)) void act({ action: "delete-team", id: entry.id }, `${entry.name} deleted.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card eyebrow="One Captain per team" title="Add a team">
          <form onSubmit={addTeam} className="grid gap-3 sm:grid-cols-2">
            <TeamFields value={team} onChange={setTeam} />
            <Button type="submit" variant="primary" size="md" disabled={busy} className="sm:col-span-2"><Plus size={15} /> Add team</Button>
          </form>
        </Card>
        <Card eyebrow="One team per line · paste from a spreadsheet or CSV" title="Import teams">
          <textarea aria-label="Teams to import" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"name, table, captain name, captain email\n\"Smith, Jones & Co\", 1, Asha Rao, asha@example.com"} className={cn(inputClass, "h-28 w-full py-2 font-mono text-xs")} />
          <p className="mt-2 text-xs text-muted">Columns: team name, table, Captain name, Captain email. Names with commas go in quotes; rows copied straight from Excel or Sheets work too.</p>
          <Button variant="outline" disabled={busy || !csv.trim()} onClick={importCsv} className="mt-3"><Upload size={14} /> Import teams</Button>
        </Card>
      </div>

      <Card eyebrow="Captain access" title={`Roster (${overview.teams.filter((entry) => entry.isActive).length}/30 active)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="kicker text-muted"><tr><th className="py-2">Team</th><th>Table</th><th>Captain</th><th>Signed in</th><th className="text-right">Access</th></tr></thead>
            <tbody>
              {overview.teams.map((entry) => editing?.id === entry.id ? (
                <tr key={entry.id} className="border-t border-rule"><td colSpan={5} className="py-3">
                  <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-[1fr_80px_1fr_1.4fr_auto_auto]">
                    <TeamFields value={editing} onChange={(value) => setEditing({ ...editing, ...value })} />
                    <Button type="submit" variant="primary" disabled={busy}>Save</Button>
                    <Button onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                </td></tr>
              ) : (
                <tr key={entry.id} className={cn("border-t border-rule align-top", !entry.isActive && "opacity-50")}>
                  <td className="py-2.5 font-semibold text-ink">{entry.name}{!entry.isActive && <span className="ml-2 text-xs font-normal text-danger">deactivated</span>}</td>
                  <td className="py-2.5">{entry.tableNumber}</td>
                  <td className="py-2.5"><p>{entry.captainName}</p><p className="font-mono text-xs text-muted">{entry.captainEmail}</p>{locked.has(entry.captainEmail) && <LockBadge email={entry.captainEmail} act={act} busy={busy} />}</td>
                  <td className="py-2.5 text-xs">{entry.activeSessions > 0 ? <span className="font-semibold text-success">Yes · {time(entry.lastSignInAt)}</span> : <span className="text-faint">{entry.lastSignInAt ? "Signed out" : "Not yet"}</span>}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {entry.isActive ? <>
                        <Button disabled={busy} onClick={() => sendAccess(entry.id)} title="Email a fresh six-digit OTP"><Mail size={13} /> Resend OTP</Button>
                        <Button disabled={busy} onClick={() => window.confirm(`Sign out ${entry.name}'s Captain on every device?`) && act({ action: "revoke-access", id: entry.id }, "Access revoked.")}>Revoke</Button>
                        <Button disabled={busy} onClick={() => setEditing({ id: entry.id, name: entry.name, tableNumber: entry.tableNumber, captainName: entry.captainName, captainEmail: entry.captainEmail })}><Pencil size={13} /> Edit / transfer</Button>
                        <Button variant="danger" disabled={busy} aria-label={`Deactivate ${entry.name}`} title="Deactivate" onClick={() => window.confirm(`Deactivate ${entry.name}? They stop appearing in scores and can't sign in.`) && act({ action: "set-team-active", id: entry.id, active: false }, "Team deactivated.")}><UserX size={13} /></Button>
                      </> : <Button disabled={busy} onClick={() => act({ action: "set-team-active", id: entry.id, active: true }, "Team reactivated.")}>Reactivate</Button>}
                      <Button variant="danger" disabled={busy} onClick={() => deleteTeam(entry)} aria-label={`Delete ${entry.name}`} title="Delete a team that never played"><Trash2 size={13} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!overview.teams.length && <p className="py-4 text-sm text-muted">No teams yet.</p>}
        </div>
      </Card>

      <Card eyebrow="Game Master & Score Controller · set in src/data/event.ts (MASTER_EMAILS)" title="Master accounts">
        <div className="flex flex-wrap gap-2">
          {overview.masters.map((email) => (
            <div key={email} className="chip bg-surface-sunk px-3 py-2 font-mono text-xs text-muted">
              {email}
              {locked.has(email) && <div><LockBadge email={email} act={act} busy={busy} /></div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
