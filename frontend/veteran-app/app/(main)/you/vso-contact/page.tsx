"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { VsoCard } from "@/components/you/VsoCard";
import { PageContainer } from "@/components/shared/PageContainer";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

export default function VsoContactPage() {
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

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">Your VSO</h1>

      {isLoading || !claim ? (
        <LoadingSkeleton label="Loading your VSO's information" className="max-w-none" />
      ) : (
        <VsoCard vso={claim.vso} />
      )}
    </PageContainer>
  );
}
