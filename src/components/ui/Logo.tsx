import Image from "next/image";
import { cn } from "@/lib/utils";

/** The BOT Consulting wordmark: `light` for teal bars, `dark` for cream surfaces. */
export function Logo({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  return <Image src={`/brand/bot-logo-${tone}.svg`} alt="BOT Consulting" width={155} height={40} priority className={cn("h-8 w-auto", className)} />;
}
