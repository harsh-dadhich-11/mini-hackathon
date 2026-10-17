import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ eyebrow, title, action, children, className }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <p className="kicker mb-1 text-teal-mid">{eyebrow}</p>}
          <h2 className="font-display text-h3 text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
