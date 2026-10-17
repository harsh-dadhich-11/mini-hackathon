import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-teal-mid/30 bg-panel-teal text-teal-base",
  success: "border-success/30 bg-panel-success text-success",
  warning: "border-warning/30 bg-panel-warning text-warning",
  danger: "border-danger/30 bg-panel-danger text-danger",
};

export function Notice({ tone = "info", children, className, role }: { tone?: keyof typeof tones; children: ReactNode; className?: string; role?: string }) {
  return <div role={role} className={cn("tile border px-4 py-3 text-sm leading-6", tones[tone], className)}>{children}</div>;
}
