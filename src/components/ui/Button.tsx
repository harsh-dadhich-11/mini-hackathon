import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent text-white hover:bg-accent-deep disabled:bg-rule-strong disabled:text-white",
  secondary: "bg-teal-dark text-cream hover:bg-teal-base disabled:bg-rule-strong",
  outline: "border border-teal-mid text-teal-base hover:bg-panel-teal disabled:border-rule disabled:text-faint",
  quiet: "border border-rule-strong text-ink hover:bg-surface-sunk disabled:opacity-40",
  danger: "border border-danger/40 text-danger hover:bg-panel-danger disabled:opacity-40",
};

const sizes = {
  sm: "gap-1.5 px-3.5 py-1.5 text-xs",
  md: "gap-2 px-5 py-2.5 text-sm",
  lg: "gap-2 px-7 py-3.5 text-sm",
};

export type ButtonVariant = keyof typeof variants;

/** Pill button. Defaults to type="button" so it never submits a form by accident. */
export function Button({ variant = "quiet", size = "sm", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof sizes }) {
  return <button type={type} {...props} className={cn("inline-flex items-center justify-center rounded-full font-semibold transition-colors disabled:cursor-not-allowed", variants[variant], sizes[size], className)} />;
}
