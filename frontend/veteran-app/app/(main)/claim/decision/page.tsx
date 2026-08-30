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
import { PageContainer } from "@/components/shared/PageContainer";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { IconListDetails } from "@tabler/icons-react";

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
        <LoadingSkeleton label="Loading your decision" />
      </div>
    );
  }

  const { decision } = claim;
  const hasDeniedOrLow = decision.conditions.some((c) => c.outcome === "denied") || decision.combinedRating < 30;

  return (
    <PageContainer>
      <DecisionFixtureSwitcher current={fixtureOverride} />

      <RatingHeadline combinedRating={decision.combinedRating} monthlyAmount={decision.monthlyAmount} />

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-medium text-text-primary">
          <IconListDetails size={20} className="text-text-secondary" aria-hidden="true" />
          Condition by condition
        </h2>
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {decision.conditions.map((condition) => (
            <ConditionRow key={condition.id} condition={condition} />
          ))}
        </ul>
      </section>

      <RatingMathCard steps={decision.mathSteps} />

      <UnlocksCard unlocks={decision.unlocks} />

      {hasDeniedOrLow && <OptionsCard />}
    </PageContainer>
  );
}
