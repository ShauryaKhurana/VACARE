import type { ClaimStage } from "@/lib/api/types";

const STAGE_COPY: Record<ClaimStage, { headline: string; detail: string }> = {
  submitted: {
    headline: "Your claim has been submitted",
    detail:
      "VA has received it and will begin reviewing soon. We'll tell you the moment anything changes.",
  },
  development: {
    headline: "Your claim is being reviewed",
    detail:
      "This stage is called “development.” Most claims like yours take about 6–10 more weeks. We'll tell you the moment anything changes.",
  },
  "exam-scheduled": {
    headline: "An exam has been scheduled",
    detail:
      "A doctor's evaluation is part of most claims -- it usually happens a few weeks before a decision.",
  },
  resolved: {
    headline: "A decision has been made",
    detail: "See what it means for you below.",
  },
};

/** Never VA's raw stage label, always a plain-language translation (HLD Section 4.5). */
export function StageBanner({ stage }: { stage: ClaimStage }) {
  const copy = STAGE_COPY[stage];
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-lg font-medium text-text-primary">{copy.headline}</h2>
      <p className="mt-1 text-sm text-text-secondary">{copy.detail}</p>
    </div>
  );
}
