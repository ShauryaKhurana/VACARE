import { IconShieldCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * The VA CARE mark: a solid, filled badge (not an outline in a pale tint,
 * which read as decoration rather than a mark) paired with a two-tone
 * wordmark -- "VA" carries the accent color, tight tracking and real
 * weight, the way a designed logo reads rather than a plain UI label.
 *
 * `variant="vso"` appends a small "+" superscript badge -- the one visual
 * cue a VSO rep has that they're in the partner tool, not the veteran app,
 * since the two otherwise share brand/tokens deliberately. Kept minimal
 * (no color/shape change to the mark itself) so the two surfaces still read
 * as one product family.
 *
 * The "for VSOs" sublabel renders on its own line under the wordmark rather
 * than inline beside it -- inline crowded the baseline next to "VA CARE",
 * especially in the mobile top bar's tighter horizontal space. Stacking it
 * still fits inside the icon badge's own height (44px), so it doesn't grow
 * either usage site's chrome.
 */
export function Logo({
  className,
  variant = "veteran",
}: {
  className?: string;
  variant?: "veteran" | "vso";
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
        <IconShieldCheck size={22} aria-hidden="true" />
        {variant === "vso" && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-accent text-[10px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            +
          </span>
        )}
      </span>
      <span className="flex flex-col justify-center">
        <span className="flex items-baseline gap-1 text-xl leading-tight font-semibold tracking-tight text-text-primary">
          <span className="text-accent">VA</span>
          <span>CARE</span>
        </span>
        {variant === "vso" && (
          <span className="text-xs leading-tight font-medium text-text-secondary">for VSOs</span>
        )}
      </span>
    </span>
  );
}
