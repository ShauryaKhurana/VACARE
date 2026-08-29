"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClaimStage } from "@/lib/api/types";

const TIMELINE_STAGES: { stage: ClaimStage; label: string; explainer: string }[] = [
  {
    stage: "submitted",
    label: "Submitted",
    explainer: "Your claim has been received by VA.",
  },
  {
    stage: "development",
    label: "Under review",
    explainer: "VA is gathering evidence -- records, and sometimes an exam.",
  },
  {
    stage: "exam-scheduled",
    label: "Exam",
    explainer: "If your claim needs one, a doctor's evaluation happens here.",
  },
  {
    stage: "resolved",
    label: "Decision",
    explainer: "VA issues a decision on each condition you claimed.",
  },
];

const STAGE_ORDER: ClaimStage[] = ["submitted", "development", "exam-scheduled", "resolved"];

export function StageTimeline({ currentStage }: { currentStage: ClaimStage }) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const [expandedStage, setExpandedStage] = useState<ClaimStage | null>(null);

  return (
    <ol className="flex flex-col gap-0">
      {TIMELINE_STAGES.map((item, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isExpanded = expandedStage === item.stage;
        return (
          <li key={item.stage} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-3 w-3 shrink-0 rounded-full border-2",
                  isDone || isCurrent
                    ? "border-accent bg-accent"
                    : "border-border bg-surface",
                )}
                aria-hidden="true"
              />
              {i < TIMELINE_STAGES.length - 1 && (
                <span
                  className={cn("w-px flex-1", isDone ? "bg-accent" : "bg-border")}
                  aria-hidden="true"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpandedStage(isExpanded ? null : item.stage)}
              className="flex-1 pb-4 text-left"
              aria-expanded={isExpanded}
            >
              <span
                className={cn(
                  "text-sm",
                  isCurrent ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {item.label}
                {isCurrent && <span className="ml-2 text-xs text-accent">(you are here)</span>}
              </span>
              {isExpanded && (
                <p className="mt-1 text-sm text-text-secondary">{item.explainer}</p>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
