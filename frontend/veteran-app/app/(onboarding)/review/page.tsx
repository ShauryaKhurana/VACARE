"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccentButton } from "@/components/shared/AccentButton";
import { ComputedTag } from "@/components/shared/ComputedTag";
import { useSessionStore } from "@/lib/store/sessionStore";
import { IconPencil, IconArrowLeft } from "@tabler/icons-react";

const SERVICE_INFO = [
  { label: "Branch", value: "U.S. Army" },
  { label: "Service dates", value: "Jun 2009 - Aug 2017" },
  { label: "Discharge type", value: "Honorable" },
];

const AUTO_CONDITIONS = ["Tinnitus", "Burn-pit related conditions"];
const NEEDS_EVIDENCE_CONDITIONS = ["Right shoulder strain -- personal statement saved"];
const DOCUMENTS = ["DD-214 -- uploaded"];

/** Wireframe 2: four separate boxes, each independently editable -- not one combined section. */
function Section({
  title,
  editHref,
  children,
}: {
  title: string;
  editHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-primary">{title}</h2>
        <Link href={editHref} className="flex items-center gap-1 text-sm text-accent">
          <IconPencil size={14} aria-hidden="true" />
          Edit
        </Link>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const routingId = useSessionStore((s) => s.routingId);
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);
  const [submitting, setSubmitting] = useState(false);

  /**
   * This no longer actually sends the claim to the VSO -- confirming here
   * used to fire confirmClaimDraft/submitClaim before the veteran had even
   * signed in, so an unauthenticated visitor could transmit a claim. The
   * real submission now happens at Connect's sign-in step; this just marks
   * the dig finished (completeOnboarding, unchanged -- the root redirect
   * depends on it to resume an abandoned session correctly) and hands off.
   */
  function handleConfirm() {
    if (!routingId) return;
    setSubmitting(true);
    completeOnboarding();
    router.push("/connect");
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6 md:max-w-2xl md:px-8 lg:max-w-3xl lg:px-12">
      <div>
        <Link href="/talk" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
          <IconArrowLeft size={16} aria-hidden="true" />
          Back to conversation
        </Link>
        <h1 className="mt-2 text-2xl md:text-3xl font-medium text-text-primary">
          Review &amp; confirm
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Take a look before this goes to your VSO -- everything here is editable.
        </p>
      </div>

      <Section title="Service info" editHref="/talk">
        <dl className="flex flex-col divide-y divide-border">
          {SERVICE_INFO.map((item) => (
            <div key={item.label} className="flex justify-between py-1.5 text-sm">
              <dt className="text-text-secondary">{item.label}</dt>
              <dd className="font-medium text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Conditions -- qualifies automatically" editHref="/talk">
        <div className="mb-1.5">
          <ComputedTag />
        </div>
        <ul className="flex flex-col gap-1 text-sm text-text-primary">
          {AUTO_CONDITIONS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>

      <Section title="Conditions -- needs evidence" editHref="/talk">
        <ul className="flex flex-col gap-1 text-sm text-text-primary">
          {NEEDS_EVIDENCE_CONDITIONS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>

      <Section title="Documents" editHref="/talk">
        <ul className="flex flex-col gap-1 text-sm text-text-primary">
          {DOCUMENTS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Section>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-text-primary">Ready for your VSO</span>
          <span className="text-text-secondary">Complete</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-full rounded-full bg-accent" />
        </div>
      </div>

      <p className="text-sm text-text-secondary">
        You&apos;re confirming this is accurate. Your VSO will review it next.
      </p>

      <AccentButton type="button" className="w-full" onClick={handleConfirm} disabled={submitting}>
        {submitting ? "Sending…" : "Confirm & send to my VSO"}
      </AccentButton>
    </div>
  );
}
