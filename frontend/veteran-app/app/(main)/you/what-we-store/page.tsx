import Link from "next/link";
import { IconArrowLeft, IconCheck, IconX } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";

const WE_KEEP = [
  "A routing identifier that connects your conversation to your VSO -- not your name, SSN, or file number",
  "Notification and accessibility preferences",
  "The conversation itself, so you can pick up where you left off",
];

const WE_DONT_KEEP = [
  "A permanent copy of your medical or service records -- those go to your VSO and VA, the systems already authorized to hold them",
  "Photo location, device ID, or timestamp data from documents you capture -- that metadata is stripped before anything is stored",
  "Payment information -- we never ask for it",
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

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 text-base font-medium text-text-primary">
          <IconCheck size={18} className="text-success" aria-hidden="true" />
          What we keep
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-text-primary">
          {WE_KEEP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 text-base font-medium text-text-primary">
          <IconX size={18} className="text-danger" aria-hidden="true" />
          What we don&apos;t keep
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-text-primary">
          {WE_DONT_KEEP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
