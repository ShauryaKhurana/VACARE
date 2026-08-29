import { IconCalculator } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * Marks content that's a deterministic, rules-based computation (presumptive
 * eligibility, rating math) rather than a subjective judgment call --
 * Visual Design Plan Section 4: "dashed border (computed fact) -> small
 * 'computed' tag, solid border" in the real visual treatment. Text label is
 * required alongside the icon so the distinction never rests on color alone.
 */
export function ComputedTag({
  label = "Computed",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-computed/30 bg-computed/10 px-2 py-0.5 text-xs font-medium text-computed",
        className,
      )}
    >
      <IconCalculator size={13} stroke={2} aria-hidden="true" />
      {label}
    </span>
  );
}
