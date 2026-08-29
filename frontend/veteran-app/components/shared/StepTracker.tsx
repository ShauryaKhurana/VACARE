import { cn } from "@/lib/utils";

/**
 * Shared horizontal stepper: the dig's progress (Talk) and a claim's stage
 * (My claim, via StageTimeline) are the same visual idea -- one continuous
 * journey, not two unrelated systems -- so they share one component instead
 * of two lookalike implementations.
 */
export function StepTracker({
  steps,
  currentIndex,
  currentNote,
  onStepClick,
}: {
  steps: string[];
  currentIndex: number;
  /** Shown under the current step's label, e.g. "(you are here)". */
  currentNote?: string;
  /** When provided, completed steps become tappable (Talk's "start over from here") -- StageTimeline never passes this, since a claim's VA-side stages aren't something a veteran can jump back into. */
  onStepClick?: (index: number) => void;
}) {
  const lastIndex = steps.length - 1;
  const filledPercent = lastIndex === 0 ? 100 : (currentIndex / lastIndex) * 100;

  return (
    <div className="relative pt-[6px]">
      <div
        className="absolute top-[6px] h-[2px] bg-border"
        style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[6px] h-[2px] bg-accent"
        style={{
          left: `${50 / steps.length}%`,
          width: `${(filledPercent / 100) * (100 - 100 / steps.length)}%`,
        }}
        aria-hidden="true"
      />
      <ol className="relative flex">
        {steps.map((label, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const clickable = isDone && !!onStepClick;
          const dot = (
            <span
              className={cn(
                "h-3.5 w-3.5 shrink-0 rounded-full border-[3px]",
                isDone || isCurrent ? "border-accent bg-accent" : "border-border bg-surface",
              )}
              aria-hidden="true"
            />
          );
          const labelText = (
            <span
              className={cn(
                "text-sm",
                isCurrent ? "font-medium text-text-primary" : "text-text-secondary",
                clickable && "underline underline-offset-2",
              )}
            >
              {label}
            </span>
          );
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-1 flex-col items-center gap-2.5 text-center"
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  aria-label={`Start over from ${label}`}
                  className="flex flex-col items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {dot}
                  {labelText}
                </button>
              ) : (
                <>
                  {dot}
                  {labelText}
                </>
              )}
              {isCurrent && currentNote && (
                <span className="text-xs text-accent">{currentNote}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
