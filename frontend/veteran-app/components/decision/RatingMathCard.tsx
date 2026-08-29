import { Card, CardContent } from "@/components/ui/card";
import { ComputedTag } from "@/components/shared/ComputedTag";

/**
 * VA's actual combined-rating math, shown step by step -- a deterministic
 * correctness primitive, not a judgment call (requirements Section 4.3),
 * which is why this card carries the Computed tag like EligibilityCard.
 */
export function RatingMathCard({ steps }: { steps: { label: string; value: string }[] }) {
  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-text-primary">How we got to your rating</h3>
          <ComputedTag />
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={step.label} className="flex gap-3 text-sm">
              <span className="text-text-secondary">{i + 1}.</span>
              <div>
                <p className="text-text-primary">{step.label}</p>
                <p className="text-text-secondary">{step.value}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-text-secondary">
          VA combines ratings using a formula, not simple addition -- that&apos;s why the numbers above don&apos;t sum directly.
        </p>
      </CardContent>
    </Card>
  );
}
