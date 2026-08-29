import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Dev-only convenience, not part of the spec: lets a reviewer preview every
 * mock fixture state via a URL param instead of editing localStorage by
 * hand. Renders nothing in production.
 */
export const CLAIM_FIXTURE_ROUTING_IDS: Record<string, string> = {
  submitted: "route-just-submitted",
  development: "route-in-development",
  exam: "route-exam-scheduled",
  "resolved-partial": "route-resolved-partial",
  "resolved-full": "route-resolved-full-grant",
  "resolved-denied": "route-resolved-denied",
};

const CLAIM_LABELS: Record<string, string> = {
  submitted: "Submitted",
  development: "Development",
  exam: "Exam scheduled",
  "resolved-partial": "Resolved (partial)",
  "resolved-full": "Resolved (full grant)",
  "resolved-denied": "Resolved (denied)",
};

export function FixtureSwitcher({ current }: { current: string | null }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="flex flex-wrap gap-1.5 rounded-control border border-dashed border-computed/40 bg-computed/5 p-2">
      <span className="w-full text-[11px] font-medium uppercase tracking-wide text-computed">
        Dev preview
      </span>
      {Object.keys(CLAIM_FIXTURE_ROUTING_IDS).map((key) => (
        <Link
          key={key}
          href={`/claim?fixture=${key}`}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            current === key
              ? "border-computed bg-computed/10 text-computed"
              : "border-border text-text-secondary",
          )}
        >
          {CLAIM_LABELS[key]}
        </Link>
      ))}
    </div>
  );
}

export const DECISION_FIXTURE_ROUTING_IDS: Record<string, string> = {
  partial: "route-resolved-partial",
  full: "route-resolved-full-grant",
  denied: "route-resolved-denied",
};

const DECISION_LABELS: Record<string, string> = {
  partial: "Partial grant",
  full: "Full grant",
  denied: "Denied",
};

export function DecisionFixtureSwitcher({ current }: { current: string | null }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="flex flex-wrap gap-1.5 rounded-control border border-dashed border-computed/40 bg-computed/5 p-2">
      <span className="w-full text-[11px] font-medium uppercase tracking-wide text-computed">
        Dev preview
      </span>
      {Object.keys(DECISION_FIXTURE_ROUTING_IDS).map((key) => (
        <Link
          key={key}
          href={`/claim/decision?fixture=${key}`}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            current === key
              ? "border-computed bg-computed/10 text-computed"
              : "border-border text-text-secondary",
          )}
        >
          {DECISION_LABELS[key]}
        </Link>
      ))}
    </div>
  );
}
