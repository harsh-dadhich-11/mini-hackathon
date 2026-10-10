"use client";

import { useState } from "react";
import { Card, inputClass, type Overview } from "./master-ui";

export function AuditTab({ overview }: { overview: Overview }) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const rows = overview.audit.filter((row) => !needle || [row.actorEmail, row.action, row.target, row.detailJson].some((value) => value.toLowerCase().includes(needle)));
  const teamName = new Map(overview.teams.map((team) => [team.id, team.name]));

  return (
    <Card eyebrow="Latest 300 entries, newest first" title="Audit log" action={<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by action, person, round…" className={inputClass + " w-64"} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Time</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap py-1.5 font-mono text-xs text-slate-500">{new Date(row.createdAt).toLocaleTimeString()}</td>
                <td className="text-xs">{row.actorEmail}</td>
                <td className="font-semibold">{row.action}</td>
                <td className="text-xs">{teamName.get(row.target) ?? row.target}</td>
                <td className="max-w-md break-words font-mono text-[11px] text-slate-500">{row.detailJson === "{}" ? "" : row.detailJson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
