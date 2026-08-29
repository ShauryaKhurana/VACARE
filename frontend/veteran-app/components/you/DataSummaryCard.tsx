import Link from "next/link";
import { IconShieldLock } from "@tabler/icons-react";

/**
 * A persistent, always-accessible answer to "what do you know about me"
 * (HLD Section 2, "Radical honesty about time and about data") -- not a
 * one-time onboarding screen.
 */
export function DataSummaryCard() {
  return (
    <div className="rounded-card border border-border bg-accent-tint/40 p-4">
      <div className="flex items-start gap-3">
        <IconShieldLock size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="text-sm text-text-primary">
            We keep only what&apos;s needed to route your claim to your VSO -- not a copy of your
            medical or service records.
          </p>
          <Link
            href="/you/what-we-store"
            className="mt-1 inline-block text-sm font-medium text-accent underline underline-offset-2"
          >
            See exactly what we store
          </Link>
        </div>
      </div>
    </div>
  );
}
