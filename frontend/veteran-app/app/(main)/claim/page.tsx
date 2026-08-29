"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { StageBanner } from "@/components/claim/StageBanner";
import { StageTimeline } from "@/components/claim/StageTimeline";
import { NeedsAttentionCard } from "@/components/claim/NeedsAttentionCard";
import { UpcomingCard } from "@/components/claim/UpcomingCard";
import { UpdatesFeed } from "@/components/claim/UpdatesFeed";
import { ResolvedBanner } from "@/components/claim/ResolvedBanner";
import { FixtureSwitcher, CLAIM_FIXTURE_ROUTING_IDS } from "@/components/dev/FixtureSwitcher";
import { IconMessageCircle2, IconBadge } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimPageContent />
    </Suspense>
  );
}

function ClaimPageContent() {
  const routingId = useSessionStore((s) => s.routingId);
  const searchParams = useSearchParams();
  const fixtureOverride = searchParams.get("fixture");
  const effectiveRoutingId =
    (fixtureOverride && CLAIM_FIXTURE_ROUTING_IDS[fixtureOverride]) || routingId;

  const { data: claim, isLoading } = useQuery({
    queryKey: ["claim", effectiveRoutingId],
    queryFn: () => apiClient.getClaim(effectiveRoutingId as string),
    enabled: !!effectiveRoutingId,
  });

  if (isLoading || !claim) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          className="h-32 w-full max-w-md animate-pulse rounded-card border border-border bg-accent-tint/40"
          role="status"
          aria-label="Loading your claim"
        />
      </div>
    );
  }

  return (
    <PageContainer>
      <FixtureSwitcher current={fixtureOverride} />

      <Link
        href="/you/vso-contact"
        className="flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
      >
        <IconBadge size={14} className="text-accent" aria-hidden="true" />
        Working with {claim.vso.name}, {claim.vso.organization}
      </Link>

      {claim.stage === "resolved" ? <ResolvedBanner /> : <StageBanner stage={claim.stage} />}

      <div className="rounded-card border border-border bg-surface p-4">
        <StageTimeline currentStage={claim.stage} />
      </div>

      {claim.needsAttention.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-medium text-text-primary">Needs your attention</h2>
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
            {claim.needsAttention.map((item) => (
              <NeedsAttentionCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {claim.upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-medium text-text-primary">Upcoming</h2>
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
            {claim.upcoming.map((item) => (
              <UpcomingCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-medium text-text-primary">Updates</h2>
        <div className="rounded-card border border-border bg-surface p-4">
          <UpdatesFeed updates={claim.updates} />
        </div>
      </section>

      <Link
        href="/talk"
        className="sticky bottom-4 mt-2 flex items-center justify-center gap-2 self-center rounded-control bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm"
      >
        <IconMessageCircle2 size={18} aria-hidden="true" />
        Ask a question
      </Link>
    </PageContainer>
  );
}
