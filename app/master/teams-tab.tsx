"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Mail, Pencil, Plus, Upload, UserX } from "lucide-react";
import { Btn, Card, inputClass, time, type TabProps } from "./master-ui";

const blankTeam = { name: "", tableNumber: "", captainName: "", captainEmail: "" };
type TeamForm = typeof blankTeam;

function TeamFields({ value, onChange }: { value: TeamForm; onChange: (value: TeamForm) => void }) {
  return <>
    <input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Team name" className={inputClass} />
    <input required value={value.tableNumber} onChange={(event) => onChange({ ...value, tableNumber: event.target.value })} placeholder="Table" className={inputClass} />
    <input required value={value.captainName} onChange={(event) => onChange({ ...value, captainName: event.target.value })} placeholder="Captain name" className={inputClass} />
    <input required type="email" value={value.captainEmail} onChange={(event) => onChange({ ...value, captainEmail: event.target.value })} placeholder="Captain email" className={inputClass} />
  </>;
}

export function TeamsTab({ overview, act, busy, setNotice }: TabProps) {
  const [team, setTeam] = useState(blankTeam);
  const [csv, setCsv] = useState("");
  const [editing, setEditing] = useState<(TeamForm & { id: string }) | null>(null);
  const [master, setMaster] = useState({ displayName: "", email: "" });

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
    const result = await act({ action: "send-access", id: teamId }) as { delivered: boolean } | undefined;
    if (result) setNotice(result.delivered ? { text: "Fresh six-digit OTP sent to the rostered Captain." } : { text: "Email delivery is not configured or failed. Verify the Resend production secrets before the event.", error: true });
  }

  async function addMaster(event: FormEvent) {
    event.preventDefault();
    if (await act({ action: "add-master", ...master }, "Master added.") !== undefined) setMaster({ displayName: "", email: "" });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card eyebrow="One Captain per team" title="Add a team">
          <form onSubmit={addTeam} className="grid gap-3 sm:grid-cols-2">
            <TeamFields value={team} onChange={setTeam} />
            <Btn variant="primary" disabled={busy} className="h-10 sm:col-span-2"><Plus size={15} /> Add team</Btn>
          </form>
        </Card>
        <Card eyebrow="One team per line" title="Import CSV">
          <textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"name, table, captain name, captain email\nThe Disruptors, 1, Asha Rao, asha@example.com"} className={inputClass + " h-28 w-full py-2 font-mono text-xs"} />
          <Btn variant="outline" disabled={busy || !csv.trim()} onClick={importCsv} className="mt-3"><Upload size={14} /> Import teams</Btn>
        </Card>
      </div>

      <Card eyebrow="Captain access" title={`Roster (${overview.teams.filter((entry) => entry.isActive).length}/30 active)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Team</th><th>Table</th><th>Captain</th><th>Signed in</th><th className="text-right">Access</th></tr></thead>
            <tbody>
              {overview.teams.map((entry) => editing?.id === entry.id ? (
                <tr key={entry.id} className="border-t border-slate-100"><td colSpan={5} className="py-3">
                  <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-[1fr_80px_1fr_1.4fr_auto_auto]">
                    <TeamFields value={editing} onChange={(value) => setEditing({ ...editing, ...value })} />
                    <Btn variant="primary" disabled={busy}>Save</Btn>
                    <Btn type="button" onClick={() => setEditing(null)}>Cancel</Btn>
                  </form>
                </td></tr>
              ) : (
                <tr key={entry.id} className={"border-t border-slate-100 " + (entry.isActive ? "" : "opacity-50")}>
                  <td className="py-2 font-semibold">{entry.name}{!entry.isActive && <span className="ml-2 text-xs font-normal text-rose-700">deactivated</span>}</td>
                  <td>{entry.tableNumber}</td>
                  <td><p>{entry.captainName}</p><p className="font-mono text-xs text-slate-500">{entry.captainEmail}</p></td>
                  <td className="text-xs">{entry.activeSessions > 0 ? <span className="font-semibold text-emerald-700">Yes · {time(entry.lastSignInAt)}</span> : <span className="text-slate-400">{entry.lastSignInAt ? "Signed out" : "Not yet"}</span>}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {entry.isActive ? <>
                        <Btn disabled={busy} onClick={() => sendAccess(entry.id)} title="Email a fresh six-digit OTP"><Mail size={13} /> Resend OTP</Btn>
                        <Btn disabled={busy} onClick={() => window.confirm(`Sign out ${entry.name}'s Captain on every device?`) && act({ action: "revoke-access", id: entry.id }, "Access revoked.")}>Revoke</Btn>
                        <Btn disabled={busy} onClick={() => setEditing({ id: entry.id, name: entry.name, tableNumber: entry.tableNumber, captainName: entry.captainName, captainEmail: entry.captainEmail })}><Pencil size={13} /> Edit / transfer</Btn>
                        <Btn variant="danger" disabled={busy} onClick={() => window.confirm(`Deactivate ${entry.name}? They stop appearing in scores and can't sign in.`) && act({ action: "set-team-active", id: entry.id, active: false }, "Team deactivated.")}><UserX size={13} /></Btn>
                      </> : <Btn disabled={busy} onClick={() => act({ action: "set-team-active", id: entry.id, active: true }, "Team reactivated.")}>Reactivate</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!overview.teams.length && <p className="py-4 text-sm text-slate-500">No teams yet.</p>}
        </div>
      </Card>

      <Card eyebrow="Game Master & Score Controller · exactly two non-playing accounts" title={`Master accounts (${overview.masters.length}/2)`}>
        <div className="mb-4 flex flex-wrap gap-2">{overview.masters.map((entry) => <div key={entry.email} className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><p className="font-semibold text-slate-800">{entry.displayName}</p><p className="font-mono text-xs text-slate-500">{entry.email}</p></div>)}</div>
        <form onSubmit={addMaster} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input required value={master.displayName} onChange={(event) => setMaster({ ...master, displayName: event.target.value })} placeholder="Name" className={inputClass} />
          <input required type="email" value={master.email} onChange={(event) => setMaster({ ...master, email: event.target.value })} placeholder="Master email" className={inputClass} />
          <Btn variant="outline" disabled={busy || overview.masters.length >= 2}><Plus size={14} /> Add Master</Btn>
        </form>
      </Card>
    </div>
  );
}
