"use client";

import { IconFileDownload } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";

/**
 * Offers the veteran their filled 21-526EZ to read before anyone files it.
 *
 * This is deliberately framed as a draft to check, not a submission: the
 * accredited representative is still the one who reviews and files (MVP
 * guardrail, requirements Section 4.4). Renders nothing when there is no
 * backend to generate the form.
 */
export function DraftFormCard({ routingId }: { routingId: string }) {
  const href = apiClient.formDownloadUrl(routingId);
  if (!href) return null;

  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="text-lg font-medium text-text-primary">Your form so far</h3>
        <p className="text-sm text-text-secondary">
          This is the VA&apos;s own application (form 21-526EZ) filled in with what
          you&apos;ve told us. Read it over if you like. Your representative reviews
          and files it — downloading it doesn&apos;t send anything to the VA.
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-control border border-border bg-surface px-4 py-3 text-base font-medium text-text-primary hover:bg-accent-tint/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconFileDownload size={18} aria-hidden="true" />
          Download my draft form (PDF)
        </a>
        <p className="text-xs text-text-secondary">
          Everything you&apos;ve told us is filled in. Anything still blank is
          something we haven&apos;t asked you for yet — and the signature, which
          has to be yours.
        </p>
      </CardContent>
    </Card>
  );
}
