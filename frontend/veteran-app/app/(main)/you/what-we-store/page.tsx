import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { DataStorageBreakdown } from "@/components/you/DataStorageBreakdown";

export default function WhatWeStorePage() {
  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">What we store</h1>
      <p className="text-sm text-text-secondary">
        A conversation with us isn&apos;t the same as handing a new company your full medical and
        service history -- we&apos;re closer to a translator sitting between you and the VSO/VA
        systems that already legitimately hold that data.
      </p>

      <DataStorageBreakdown />

      <label className="flex w-fit items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" className="h-4 w-4 rounded-sm border-border accent-accent" />
        I&apos;ve read our full privacy approach above
      </label>
    </PageContainer>
  );
}
