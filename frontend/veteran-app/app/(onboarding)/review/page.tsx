"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccentButton } from "@/components/shared/AccentButton";
import { ComputedTag } from "@/components/shared/ComputedTag";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { IconPencil } from "@tabler/icons-react";

const SERVICE_INFO = [
  { label: "Branch", value: "U.S. Army" },
  { label: "Service dates", value: "Jun 2009 - Aug 2017" },
  { label: "Discharge type", value: "Honorable" },
];

const AUTO_CONDITIONS = ["Tinnitus", "Burn-pit related conditions"];
const NEEDS_EVIDENCE_CONDITIONS = ["Right shoulder strain"];

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
        <h2 className="text-base font-medium text-text-primary">{title}</h2>
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

  async function handleConfirm() {
    if (!routingId) return;
    setSubmitting(true);
    await apiClient.confirmClaimDraft(routingId);
    completeOnboarding();
    router.push("/connect");
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-medium text-text-primary">Review &amp; confirm</h1>
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

      <Section title="Conditions" editHref="/talk">
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm text-text-secondary">
              Qualifies automatically <ComputedTag />
            </p>
            <ul className="flex flex-col gap-1 text-sm text-text-primary">
              {AUTO_CONDITIONS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-text-secondary">Needs evidence</p>
            <ul className="flex flex-col gap-1 text-sm text-text-primary">
              {NEEDS_EVIDENCE_CONDITIONS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Statements &amp; documents" editHref="/talk">
        <ul className="flex flex-col gap-1 text-sm text-text-primary">
          <li>DD-214 -- uploaded</li>
          <li>Personal statement (right shoulder) -- saved</li>
        </ul>
      </Section>

      <p className="text-sm text-text-secondary">
        You&apos;re confirming this is accurate. Your VSO will review it next.
      </p>

      <AccentButton type="button" className="w-full" onClick={handleConfirm} disabled={submitting}>
        {submitting ? "Sending…" : "Confirm & send to my VSO"}
      </AccentButton>
    </div>
  );
}
