"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { RatingHeadline } from "@/components/decision/RatingHeadline";
import { ConditionRow } from "@/components/decision/ConditionRow";
import { RatingMathCard } from "@/components/decision/RatingMathCard";
import { UnlocksCard } from "@/components/decision/UnlocksCard";
import { OptionsCard } from "@/components/decision/OptionsCard";
import {
  DecisionFixtureSwitcher,
  DECISION_FIXTURE_ROUTING_IDS,
} from "@/components/dev/FixtureSwitcher";

export default function DecisionPage() {
  return (
    <Suspense fallback={null}>
      <DecisionPageContent />
    </Suspense>
  );
}

function DecisionPageContent() {
  const routingId = useSessionStore((s) => s.routingId);
  const searchParams = useSearchParams();
  const fixtureOverride = searchParams.get("fixture");
  const effectiveRoutingId =
    (fixtureOverride && DECISION_FIXTURE_ROUTING_IDS[fixtureOverride]) || routingId;

  const { data: claim, isLoading } = useQuery({
    queryKey: ["claim", effectiveRoutingId],
    queryFn: () => apiClient.getClaim(effectiveRoutingId as string),
    enabled: !!effectiveRoutingId,
  });

  if (isLoading || !claim?.decision) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          className="h-32 w-full max-w-md animate-pulse rounded-card border border-border bg-accent-tint/40"
          role="status"
          aria-label="Loading your decision"
        />
      </div>
    );
  }

  const { decision } = claim;
  const hasDeniedOrLow = decision.conditions.some((c) => c.outcome === "denied") || decision.combinedRating < 30;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-6">
        <DecisionFixtureSwitcher current={fixtureOverride} />

        <RatingHeadline combinedRating={decision.combinedRating} monthlyAmount={decision.monthlyAmount} />

        <section>
          <h2 className="mb-2 text-base font-medium text-text-primary">Condition by condition</h2>
          <ul className="flex flex-col gap-2">
            {decision.conditions.map((condition) => (
              <ConditionRow key={condition.id} condition={condition} />
            ))}
          </ul>
        </section>

        <RatingMathCard steps={decision.mathSteps} />

        <UnlocksCard unlocks={decision.unlocks} />

        {hasDeniedOrLow && <OptionsCard />}
      </div>
    </div>
  );
}
