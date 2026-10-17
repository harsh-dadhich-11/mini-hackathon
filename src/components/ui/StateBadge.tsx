import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  draft: "bg-surface-sunk text-muted",
  open: "bg-panel-success text-success",
  paused: "bg-panel-warning text-warning",
  closed: "bg-panel-cyan text-teal-base",
  scored: "bg-panel-orange text-accent-deep",
  revealed: "bg-teal-dark text-cream",
};

const labels: Record<string, string> = { revealed: "published" };

export function StateBadge({ state }: { state: string }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", styles[state] ?? styles.draft)}>{labels[state] ?? state}</span>;
}
