"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { DataStorageBreakdown } from "@/components/you/DataStorageBreakdown";
import { useSessionStore } from "@/lib/store/sessionStore";

export default function WhatWeStorePage() {
  // "See what we store" is reachable from Talk at any point in the dig, but
  // the You page itself is only a real destination once a claim has been
  // submitted (same gate as the nav tabs) -- without this, the back link
  // here would be a way around that gate.
  const hasEverSubmitted = useSessionStore((s) => s.hasEverSubmitted);
  const backHref = hasEverSubmitted ? "/you" : "/talk";
  const backLabel = hasEverSubmitted ? "Back to You" : "Back to Talk";

  return (
    <PageContainer>
      <Link href={backHref} className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        {backLabel}
      </Link>

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">What we store</h1>
      <p className="text-sm text-text-secondary">
        A conversation with us isn&apos;t the same as handing a new company your full medical and
        service history -- we&apos;re closer to a translator sitting between you and the VSO/VA
        systems that already legitimately hold that data.
      </p>

      <DataStorageBreakdown />
    </PageContainer>
  );
}
