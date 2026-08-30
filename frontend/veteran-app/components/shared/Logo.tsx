import { IconShieldCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * The VA CARE mark: a solid, filled badge (not an outline in a pale tint,
 * which read as decoration rather than a mark) paired with a two-tone
 * wordmark -- "VA" carries the accent color, tight tracking and real
 * weight, the way a designed logo reads rather than a plain UI label.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
        <IconShieldCheck size={22} aria-hidden="true" />
      </span>
      <span className="flex items-baseline gap-1 text-xl font-semibold tracking-tight text-text-primary">
        <span className="text-accent">VA</span>
        <span>CARE</span>
      </span>
    </span>
  );
}
