import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { StatusTag } from "@/components/shared/StatusTag";

const CATEGORIES = [
  {
    title: "Your routing ID",
    tag: "Stored" as const,
    variant: "success" as const,
    detail:
      "A routing identifier that connects your conversation to your VSO -- not your name, SSN, or file number.",
  },
  {
    title: "Your service and medical records",
    tag: "Not stored" as const,
    variant: "pending" as const,
    detail:
      "Those go to your VSO and VA -- the systems already authorized to hold them. We don't keep a copy, and photo metadata (location, device ID, timestamp) is stripped before anything is uploaded.",
  },
  {
    title: "Your conversation with your guide",
    tag: "Stored" as const,
    variant: "success" as const,
    detail:
      "So you can pick up where you left off, along with your notification and accessibility preferences.",
  },
];

export default function WhatWeStorePage() {
  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-xl font-medium text-text-primary">What we store</h1>
      <p className="text-sm text-text-secondary">
        A conversation with us isn&apos;t the same as handing a new company your full medical and
        service history -- we&apos;re closer to a translator sitting between you and the VSO/VA
        systems that already legitimately hold that data.
      </p>

      {CATEGORIES.map((category) => (
        <section key={category.title} className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-medium text-text-primary">{category.title}</h2>
            <StatusTag variant={category.variant} label={category.tag} />
          </div>
          <p className="mt-2 text-sm text-text-secondary">{category.detail}</p>
        </section>
      ))}

      <label className="flex w-fit items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" className="h-4 w-4 rounded-sm border-border accent-accent" />
        I&apos;ve read our full privacy approach above
      </label>
    </PageContainer>
  );
}
