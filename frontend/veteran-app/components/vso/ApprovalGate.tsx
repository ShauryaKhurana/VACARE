"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { IconAlertTriangle, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";
import { StatusTag } from "@/components/shared/StatusTag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { vsoApiClient, VsoApprovalBlockedError, filingCheckBlockers } from "@/lib/api/vso/client";
import type { CaseSummaryResponse, FilingCheckItem } from "@/lib/api/vso/types";
import { cn } from "@/lib/utils";

function CheckRow({ check }: { check: FilingCheckItem }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = check.missing_items.length > 0 || !!check.detail;

  return (
    <div className="rounded-control border border-border bg-background">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!canExpand}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-2 text-sm text-text-primary">
          <StatusTag variant={check.ok ? "success" : check.optional ? "pending" : "danger"} label={check.ok ? "OK" : check.optional ? "Optional" : "Blocked"} />
          {check.label}
        </span>
        {canExpand &&
          (expanded ? (
            <IconChevronUp size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
          ) : (
            <IconChevronDown size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
          ))}
      </button>
      {expanded && (
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2 text-xs text-text-secondary">
          <p>{check.detail}</p>
          {check.missing_items.length > 0 && (
            <ul className="list-inside list-disc">
              {check.missing_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Before you approve" -- the three-item filing gate (plan: back-pay start
 * date / 21-0966, VSO representation / 21-22, required evidence) plus the
 * Approve to file action itself. Kept as one component because the
 * button's disabled state and the checklist above it must never disagree
 * about what blocks approval -- both read `filingCheckBlockers`, the same
 * function `approveToFile` itself rejects on, so there is exactly one
 * source of truth for "is this case ready."
 */
export function ApprovalGate({
  caseId,
  filingChecks,
  vsoName,
  onApproved,
}: {
  caseId: string;
  filingChecks: FilingCheckItem[];
  vsoName: string;
  onApproved: (summary: CaseSummaryResponse) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");

  const blockers = filingCheckBlockers(filingChecks);
  const isBlocked = blockers.length > 0;

  const approve = useMutation({
    mutationFn: () =>
      vsoApiClient.approveToFile(caseId, {
        reviewer_name: vsoName,
        note: note.trim() || "Approved to file with VA.",
      }),
    onSuccess: (summary) => {
      setDialogOpen(false);
      setNote("");
      onApproved(summary);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Before you approve</h3>
      <div className="flex flex-col gap-1.5">
        {filingChecks.map((check) => (
          <CheckRow key={check.label} check={check} />
        ))}
      </div>

      {isBlocked && (
        <div className="flex items-start gap-2 rounded-control bg-background px-3 py-2 text-xs text-text-secondary">
          <IconAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-text-primary">Blocking approval:</span>
            {blockers.map((b) => (
              <span key={b}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {approve.isError && (
        <div className="flex items-start gap-2" role="alert">
          <StatusTag variant="danger" label="Approval failed" className="shrink-0" />
          <span className="text-xs text-text-secondary">
            {approve.error instanceof VsoApprovalBlockedError
              ? `Still blocked: ${approve.error.blockers.join("; ")}`
              : "Something went wrong -- try again."}
          </span>
        </div>
      )}

      <AccentButton
        type="button"
        disabled={isBlocked}
        aria-disabled={isBlocked}
        onClick={() => setDialogOpen(true)}
        className={cn("w-full", isBlocked && "cursor-not-allowed")}
      >
        Approve to file
      </AccentButton>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this case to file?</DialogTitle>
            <DialogDescription>
              This tells the veteran their packet is ready and unlocks the 526EZ download. It
              doesn&apos;t submit to the VA automatically.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="approve-note" className="sr-only">
            Note to the veteran
          </label>
          <Textarea
            id="approve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note to include with the approval message…"
            rows={3}
          />
          <DialogFooter>
            <AccentButton type="button" disabled={approve.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? "Approving…" : "Confirm approval"}
            </AccentButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
