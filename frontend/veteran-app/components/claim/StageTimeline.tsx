import { cn } from "@/lib/utils";
import type { ClaimStage } from "@/lib/api/types";

const TIMELINE_STAGES: { stage: ClaimStage; label: string }[] = [
  { stage: "submitted", label: "Submitted" },
  { stage: "development", label: "Under review" },
  { stage: "exam-scheduled", label: "Exam" },
  { stage: "resolved", label: "Decision" },
];

const STAGE_ORDER: ClaimStage[] = ["submitted", "development", "exam-scheduled", "resolved"];

/** Horizontal stepper (Wireframe 3/4), not a vertical list -- current position highlighted. */
export function StageTimeline({ currentStage }: { currentStage: ClaimStage }) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const lastIndex = TIMELINE_STAGES.length - 1;
  const filledPercent = (currentIndex / lastIndex) * 100;

  return (
    <div className="relative pt-[5px]">
      <div
        className="absolute top-[5px] h-px bg-border"
        style={{ left: `${50 / TIMELINE_STAGES.length}%`, right: `${50 / TIMELINE_STAGES.length}%` }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[5px] h-px bg-accent"
        style={{
          left: `${50 / TIMELINE_STAGES.length}%`,
          width: `${(filledPercent / 100) * (100 - 100 / TIMELINE_STAGES.length)}%`,
        }}
        aria-hidden="true"
      />
      <ol className="relative flex">
        {TIMELINE_STAGES.map((item, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <li key={item.stage} className="flex flex-1 flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "h-[11px] w-[11px] shrink-0 rounded-full border-2",
                  isDone || isCurrent ? "border-accent bg-accent" : "border-border bg-surface",
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "text-xs",
                  isCurrent ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {item.label}
              </span>
              {isCurrent && <span className="text-[11px] text-accent">(you are here)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
