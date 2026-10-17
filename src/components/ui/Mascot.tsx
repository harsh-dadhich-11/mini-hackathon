import Image from "next/image";
import { cn } from "@/lib/utils";

/** The BOT owl. Decorative unless given a label. */
export function Mascot({ className, label }: { className?: string; label?: string }) {
  return (
    <Image
      src="/brand/owl-mascot.svg"
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={138}
      height={200}
      className={cn("h-32 w-auto select-none", className)}
      draggable={false}
    />
  );
}
