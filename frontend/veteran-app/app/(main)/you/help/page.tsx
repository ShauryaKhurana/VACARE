"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft, IconPhone, IconExternalLink } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { VsoCard } from "@/components/you/VsoCard";
import { PageContainer } from "@/components/shared/PageContainer";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

export default function HelpPage() {
  const routingId = useSessionStore((s) => s.routingId);
  const { data: claim, isLoading } = useQuery({
    queryKey: ["claim", routingId],
    queryFn: () => apiClient.getClaim(routingId as string),
    enabled: !!routingId,
  });

  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">Help</h1>
      <p className="text-sm text-text-secondary">
        A path to a human, independent of the conversation in this app.
      </p>

      <div className="flex flex-col gap-2">
        {isLoading || !claim ? (
          <LoadingSkeleton label="Loading your VSO's contact info" className="h-32 max-w-none" />
        ) : (
          <VsoCard vso={claim.vso} />
        )}

        <a
          href="tel:988,1"
          className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconPhone size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">Veterans Crisis Line</p>
            <p className="text-sm text-text-secondary">Dial 988, then press 1 -- available any time.</p>
          </div>
        </a>

        <a
          href="https://www.va.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconExternalLink size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">VA.gov</p>
            <p className="text-sm text-text-secondary">The official source for your claim and benefits.</p>
          </div>
        </a>
      </div>
    </PageContainer>
  );
}
