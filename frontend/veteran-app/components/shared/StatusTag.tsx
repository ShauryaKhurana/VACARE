import { IconCheck, IconAlertTriangle, IconX, IconClock } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type StatusVariant = "success" | "warning" | "danger" | "pending";

const VARIANT_CONFIG: Record<
  StatusVariant,
  { icon: typeof IconCheck; classes: string }
> = {
  success: {
    icon: IconCheck,
    classes: "border-success/30 bg-success/10 text-success",
  },
  warning: {
    icon: IconAlertTriangle,
    classes: "border-warning/30 bg-warning/10 text-warning",
  },
  danger: {
    icon: IconX,
    classes: "border-danger/30 bg-danger/10 text-danger",
  },
  pending: {
    icon: IconClock,
    classes: "border-text-secondary/30 bg-text-secondary/10 text-text-secondary",
  },
};

/**
 * Status is always paired with an icon and text label -- never color alone
 * (accessibility baseline, Frontend HLD Section 8). This is the only place
 * (besides AccentButton/ComputedTag) allowed to reference success/warning/
 * danger tokens directly.
 */
export function StatusTag({
  variant,
  label,
  className,
  wrap = false,
}: {
  variant: StatusVariant;
  label: string;
  className?: string;
  /** Every existing caller uses this for a short, fixed-width badge (a
   * status word, "12d left") where `whitespace-nowrap` + `shrink-0` is
   * exactly right -- but a label that's a full sentence (a long evidence
   * name) forced onto one unbreakable line just becomes as wide as the
   * sentence, dragging its container past the viewport on narrow screens.
   * `wrap` opts a specific call site out of the nowrap/shrink-0 pair
   * without changing the default for the ~30 other places this renders a
   * short badge. */
  wrap?: boolean;
}) {
  const { icon: Icon, classes } = VARIANT_CONFIG[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        wrap ? "text-left" : "shrink-0 whitespace-nowrap",
        classes,
        className,
      )}
    >
      <Icon
        size={13}
        stroke={2}
        className={cn("shrink-0", wrap && "mt-0.5 self-start")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
