"use client";

import { useState } from "react";
import { IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Getting to know you",
  "Checking automatic eligibility",
  "Anything else?",
  "Review",
];

/**
 * A collapsible checklist, not a percentage bar (HLD Section 4.2) -- it
 * informs without feeling bureaucratic.
 */
export function ProgressChecklist({ completedSteps }: { completedSteps: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-card border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-text-primary"
        aria-expanded={open}
      >
        <span>
          {STEPS[Math.min(completedSteps, STEPS.length - 1)]}
        </span>
        {open ? (
          <IconChevronUp size={16} aria-hidden="true" />
        ) : (
          <IconChevronDown size={16} aria-hidden="true" />
        )}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 px-4 pb-3">
          {STEPS.map((step, i) => {
            const done = i < completedSteps;
            return (
              <li key={step} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    done ? "border-accent bg-accent text-white" : "border-border text-transparent",
                  )}
                >
                  <IconCheck size={11} stroke={3} aria-hidden="true" />
                </span>
                <span className={done ? "text-text-secondary line-through" : "text-text-primary"}>
                  {step}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
