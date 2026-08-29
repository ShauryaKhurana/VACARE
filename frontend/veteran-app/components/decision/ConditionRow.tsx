import { StatusTag } from "@/components/shared/StatusTag";
import { ComputedTag } from "@/components/shared/ComputedTag";
import type { Condition } from "@/lib/api/types";

export function ConditionRow({ condition }: { condition: Condition }) {
  const variant = condition.outcome === "granted" ? "success" : condition.outcome === "denied" ? "danger" : "pending";
  const label = condition.outcome === "granted" ? "Granted" : condition.outcome === "denied" ? "Denied" : "Pending";

  return (
    <li className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-medium text-text-primary">{condition.name}</span>
        <div className="flex items-center gap-1.5">
          {condition.computedEligible && <ComputedTag />}
          <StatusTag variant={variant} label={condition.rating !== undefined && condition.outcome === "granted" ? `${label} · ${condition.rating}%` : label} />
        </div>
      </div>
      {condition.reason && <p className="text-sm text-text-secondary">{condition.reason}</p>}
    </li>
  );
}
