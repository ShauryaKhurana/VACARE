"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { VsoCard } from "@/components/you/VsoCard";

export default function VsoContactPage() {
  const routingId = useSessionStore((s) => s.routingId);

  const { data: claim, isLoading } = useQuery({
    queryKey: ["claim", routingId],
    queryFn: () => apiClient.getClaim(routingId as string),
    enabled: !!routingId,
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-6">
        <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
          <IconArrowLeft size={16} aria-hidden="true" />
          Back to You
        </Link>

        <h1 className="text-xl font-medium text-text-primary">Your VSO</h1>

        {isLoading || !claim ? (
          <div
            className="h-32 w-full animate-pulse rounded-card border border-border bg-accent-tint/40"
            role="status"
            aria-label="Loading your VSO's information"
          />
        ) : (
          <VsoCard vso={claim.vso} />
        )}
      </div>
    </div>
  );
}
