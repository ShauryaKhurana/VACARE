import { StepTracker } from "@/components/shared/StepTracker";
import type { ClaimStage } from "@/lib/api/types";

const STAGE_LABELS: { stage: ClaimStage; label: string }[] = [
  { stage: "submitted", label: "Submitted" },
  { stage: "development", label: "Under review" },
  { stage: "exam-scheduled", label: "Exam" },
  { stage: "resolved", label: "Decision" },
];

const STAGE_ORDER: ClaimStage[] = ["submitted", "development", "exam-scheduled", "resolved"];

export function StageTimeline({ currentStage }: { currentStage: ClaimStage }) {
  return (
    <StepTracker
      steps={STAGE_LABELS.map((s) => s.label)}
      currentIndex={STAGE_ORDER.indexOf(currentStage)}
      currentNote="(you are here)"
    />
  );
}
