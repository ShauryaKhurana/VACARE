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
}: {
  variant: StatusVariant;
  label: string;
  className?: string;
}) {
  const { icon: Icon, classes } = VARIANT_CONFIG[variant];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        classes,
        className,
      )}
    >
      <Icon size={13} stroke={2} className="shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
