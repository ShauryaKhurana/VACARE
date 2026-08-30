"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconMail,
  IconPhone,
} from "@tabler/icons-react";
import { vsoApiClient } from "@/lib/api/vso/client";
import { VsoPageContainer } from "@/components/vso/VsoPageContainer";
import { ApprovalGate } from "@/components/vso/ApprovalGate";
import { CaseConversation, caseMessagesKey, type CaseConversationHandle } from "@/components/vso/CaseConversation";
import { ReviewFindings } from "@/components/vso/ReviewFindings";
import {
  BRANCH_LABELS,
  DISCHARGE_LABELS,
  URGENCY_VARIANT,
  readinessBreakdown,
  veteranInitials,
} from "@/components/vso/vsoDisplay";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { StatusTag } from "@/components/shared/StatusTag";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useVsoStore } from "@/lib/store/vsoStore";
import type { ChecklistItemResponse, ReviewSuggestedState } from "@/lib/api/vso/types";

function formatDate(iso: string | null): string {
  if (!iso) return "Not on file";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function Def({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function evidenceKey(item: Pick<ChecklistItemResponse, "evidence_type" | "condition_name">): string {
  return `${item.evidence_type}::${item.condition_name ?? ""}`;
}

/** Applies to every read below except the conversation (its own polling
 * query, left untouched). With no app-wide staleTime (lib/providers.tsx),
 * every one of these was a full unstyled refetch-and-flash on any remount --
 * including a plain "back" from the inbox seconds later. A mutation
 * (approve, request info, a note) still invalidates these keys explicitly
 * via invalidateCase/afterSend, which refetches regardless of staleTime --
 * this only removes the redundant automatic refetch, not the real one. */
const CASE_DETAIL_STALE_TIME_MS = 30_000;

/**
 * The case review surface (plan Screen 2) -- desktop three-column, one
 * column under `lg`. This is where a VSO spends their 2.5-3.5 hours per
 * claim today; every computed value here is shown with its provenance so
 * that time compresses to "verify, don't redo" instead of re-deriving the
 * case from scratch.
 *
 * Thin wrapper around VsoCaseDetail, keyed on caseId: Next's client-side
 * router reuses this page's component instance when navigating from one
 * case to another (same route pattern, different param), so without a key
 * change every piece of local UI state below -- review decisions, whether
 * the packet preview is open -- would leak from the previous case onto the
 * next. `key={caseId}` forces a full remount instead, which is also the
 * React-recommended way to reset state on a prop change (no effect needed).
 */
export default function VsoCaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  return <VsoCaseDetail key={params.caseId} caseId={params.caseId} />;
}

function VsoCaseDetail({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const identity = useVsoStore((s) => s.identity);
  const markCaseSeen = useVsoStore((s) => s.markCaseSeen);
  const vsoName = identity?.name ?? "VSO";

  // Review-item decisions (Confirm/Reject/Needs review) are per-case,
  // client-local UI state -- see ReviewFindings' doc comment for why
  // there's no backend write to persist them yet.
  const [decisions, setDecisions] = useState<Record<string, ReviewSuggestedState>>({});
  const [packetOpen, setPacketOpen] = useState(false);
  const conversationRef = useRef<CaseConversationHandle>(null);

  const caseQuery = useQuery({
    queryKey: ["vso-case", caseId],
    queryFn: () => vsoApiClient.getCase(caseId),
    retry: false,
    staleTime: CASE_DETAIL_STALE_TIME_MS,
  });
  const checklistQuery = useQuery({
    queryKey: ["vso-checklist", caseId],
    queryFn: () => vsoApiClient.getChecklist(caseId),
    retry: false,
    staleTime: CASE_DETAIL_STALE_TIME_MS,
  });
  const reviewQuery = useQuery({
    queryKey: ["vso-review", caseId],
    queryFn: () => vsoApiClient.getReviewItems(caseId),
    retry: false,
    staleTime: CASE_DETAIL_STALE_TIME_MS,
  });
  const filingChecksQuery = useQuery({
    queryKey: ["vso-filing-checks", caseId],
    queryFn: () => vsoApiClient.getFilingChecks(caseId),
    retry: false,
    staleTime: CASE_DETAIL_STALE_TIME_MS,
  });
  const packetQuery = useQuery({
    queryKey: ["vso-packet", caseId],
    queryFn: () => vsoApiClient.getPacket(caseId),
    enabled: packetOpen,
    staleTime: CASE_DETAIL_STALE_TIME_MS,
  });
  // Shares CaseConversation's own query (same queryKey, react-query dedupes
  // the fetch) purely to know the newest message id for markCaseSeen --
  // clearing the inbox's unread dot the same way vsoStore documents:
  // record the newest id seen, don't guess a timestamp cutoff.
  const messagesQuery = useQuery({
    queryKey: caseMessagesKey(caseId),
    queryFn: () => vsoApiClient.getMessages(caseId),
  });
  useEffect(() => {
    const latest = messagesQuery.data?.[messagesQuery.data.length - 1];
    if (latest) markCaseSeen(caseId, latest.id);
  }, [messagesQuery.data, caseId, markCaseSeen]);

  function invalidateCase() {
    void queryClient.invalidateQueries({ queryKey: ["vso-case", caseId] });
    void queryClient.invalidateQueries({ queryKey: ["vso-checklist", caseId] });
    void queryClient.invalidateQueries({ queryKey: ["vso-filing-checks", caseId] });
    void queryClient.invalidateQueries({ queryKey: caseMessagesKey(caseId) });
    // The inbox's own query key -- so a VSO who approves here and then
    // clicks back sees the case already moved out of "Needs you."
    void queryClient.invalidateQueries({ queryKey: ["vso-caseload"] });
  }

  if (caseQuery.isLoading) {
    return (
      <VsoPageContainer className="gap-4">
        <LoadingSkeleton label="Loading case" />
        <LoadingSkeleton label="Loading case" />
      </VsoPageContainer>
    );
  }

  if (caseQuery.isError || !caseQuery.data) {
    return (
      <VsoPageContainer className="items-start gap-3">
        <Link href="/vso" className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <IconArrowLeft size={16} aria-hidden="true" />
          Back to caseload
        </Link>
        <div className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
          This case couldn&apos;t be found. It may have been reassigned or the id is wrong.
        </div>
      </VsoPageContainer>
    );
  }

  const vsoCase = caseQuery.data;
  const checklist = checklistQuery.data;
  const review = reviewQuery.data;
  const filingChecks = filingChecksQuery.data;

  const requiredMissing = checklist?.evidence_checklist.filter((i) => i.required && !i.satisfied) ?? [];
  const suggestedMissing = checklist?.evidence_checklist.filter((i) => !i.required && !i.satisfied) ?? [];
  const heldEvidence = checklist?.evidence_checklist.filter((i) => i.satisfied) ?? [];

  return (
    <VsoPageContainer className="gap-5">
      <div className="flex flex-col gap-1">
        <Link href="/vso" className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <IconArrowLeft size={16} aria-hidden="true" />
          Back to caseload
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar className="shrink-0">
              <AvatarFallback className="bg-accent-tint font-medium text-accent">
                {veteranInitials(`${vsoCase.veteran.first_name} ${vsoCase.veteran.last_name}`)}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-semibold text-text-primary">
              {vsoCase.veteran.first_name} {vsoCase.veteran.last_name}
            </h1>
            {checklist && <StatusTag variant="pending" label={checklist.lane_title} />}
          </div>
          <span className="font-mono text-xs text-text-secondary">{vsoCase.case_id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Veteran summary</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Def label="Name" value={`${vsoCase.veteran.first_name} ${vsoCase.veteran.last_name}`} />
              <Def label="Date of birth" value={formatDate(vsoCase.veteran.dob)} />
              <Def label="Branch" value={vsoCase.veteran.branch ? BRANCH_LABELS[vsoCase.veteran.branch] : "Not on file"} />
              <Def
                label="Service dates"
                value={`${formatDate(vsoCase.veteran.service_start)} – ${formatDate(vsoCase.veteran.service_end)}`}
              />
              <Def label="Discharge" value={DISCHARGE_LABELS[vsoCase.veteran.discharge_type]} />
              <Def
                label="Contact"
                value={
                  // min-w-0 on the flex column and break-all on each link is
                  // the same fix as the layout's earlier horizontal-overflow
                  // bug (README's flex-1/min-h-0 discipline, this time on
                  // the inline axis): a <dl> grid cell's default min-width
                  // is auto, so an unbroken email address was free to drag
                  // the whole grid -- and the page -- wider than the
                  // viewport instead of wrapping.
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {vsoCase.veteran.email && (
                      <a
                        href={`mailto:${vsoCase.veteran.email}`}
                        className="flex min-w-0 items-center gap-1 break-all text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <IconMail size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
                        {vsoCase.veteran.email}
                      </a>
                    )}
                    {vsoCase.veteran.phone && (
                      <a
                        href={`tel:${vsoCase.veteran.phone.replace(/[^\d+]/g, "")}`}
                        className="flex min-w-0 items-center gap-1 break-all text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <IconPhone size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
                        {vsoCase.veteran.phone}
                      </a>
                    )}
                  </span>
                }
              />
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Conditions <span className="text-text-secondary">({vsoCase.conditions.length})</span>
            </h2>
            <div className="flex flex-col divide-y divide-border">
              {vsoCase.conditions.map((condition) => {
                const conditionChecklist = (checklist?.evidence_checklist ?? []).filter(
                  (i) => i.condition_name === condition.name,
                );
                return (
                  <div key={condition.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{condition.name}</span>
                      {condition.diagnosis && (
                        <span className="text-xs text-text-secondary">— {condition.diagnosis}</span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary">{condition.current_symptoms}</p>
                    {conditionChecklist.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {conditionChecklist.map((item) => (
                          <StatusTag
                            key={evidenceKey(item)}
                            variant={item.satisfied ? "success" : item.required ? "danger" : "pending"}
                            label={item.label}
                            wrap
                            className="max-w-full"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Review findings</h2>
            {review ? (
              <ReviewFindings
                items={review.items}
                presumptiveHits={checklist?.presumptive_hits ?? []}
                evidence={vsoCase.evidence}
                decisions={decisions}
                onDecide={(itemId, state) => setDecisions((prev) => ({ ...prev, [itemId]: state }))}
              />
            ) : (
              <LoadingSkeleton label="Loading review findings" />
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Evidence</h2>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">On file</h3>
              {heldEvidence.length === 0 ? (
                <p className="text-xs text-text-secondary">Nothing confirmed on file yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {heldEvidence.map((item) => (
                    <StatusTag
                      key={evidenceKey(item)}
                      variant="success"
                      label={item.label}
                      wrap
                      className="max-w-full"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">Missing</h3>
              {requiredMissing.length === 0 && suggestedMissing.length === 0 ? (
                <p className="text-xs text-text-secondary">Nothing missing -- checklist is complete.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...requiredMissing, ...suggestedMissing].map((item) => {
                    const key = evidenceKey(item);
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-background px-3 py-2"
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-primary">
                          <StatusTag variant={item.required ? "danger" : "pending"} label={item.required ? "Required" : "Suggested"} />
                          {item.label}
                          {item.condition_name && (
                            <span className="text-xs text-text-secondary">({item.condition_name})</span>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            // Prefill + focus the conversation composer below
                            // rather than sending immediately -- the VSO
                            // reviews and edits the wording, then presses
                            // "Request evidence" themselves when it's ready.
                            const prefill = `Please provide: ${item.label}${item.condition_name ? ` (${item.condition_name})` : ""}`;
                            conversationRef.current?.setDraft(prefill);
                            conversationRef.current?.focus();
                          }}
                        >
                          Request from veteran
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <CaseConversation ref={conversationRef} caseId={caseId} vsoName={vsoName} />
        </div>

        {/* Right rail -- sticky within the page's own scroll container
            (VsoPageContainer's overflow-y-auto); no separate scroll region
            of its own, so it doesn't need its own flex-1/min-h-0 chain. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Readiness</h2>
            {checklist ? (
              <>
                <p className="text-2xl font-semibold text-text-primary">{checklist.readiness_score}/100</p>
                <p className="text-xs text-text-secondary">
                  {readinessBreakdown(
                    requiredMissing.length,
                    suggestedMissing.length,
                    checklist.warnings.length,
                    checklist.readiness_score,
                  )}
                </p>
              </>
            ) : (
              <LoadingSkeleton label="Loading readiness" className="h-16" />
            )}
          </section>

          <section className="rounded-card border border-border bg-surface p-4">
            {filingChecks ? (
              <ApprovalGate
                caseId={caseId}
                filingChecks={filingChecks}
                vsoName={vsoName}
                onApproved={invalidateCase}
              />
            ) : (
              <LoadingSkeleton label="Loading filing checklist" />
            )}
          </section>

          {checklist && checklist.deadlines.length > 0 && (
            <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-text-primary">Deadlines</h2>
              <div className="flex flex-col gap-1.5">
                {checklist.deadlines.map((deadline) => (
                  <div key={deadline.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-primary">{deadline.label}</span>
                    <StatusTag
                      variant={URGENCY_VARIANT[deadline.urgency]}
                      label={deadline.days_remaining != null ? `${deadline.days_remaining}d left` : deadline.urgency}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
            <button
              type="button"
              onClick={() => setPacketOpen((v) => !v)}
              aria-expanded={packetOpen}
              className="flex items-center justify-between gap-2 text-left"
            >
              <h2 className="text-sm font-semibold text-text-primary">Packet preview</h2>
              {packetOpen ? (
                <IconChevronUp size={16} className="text-text-secondary" aria-hidden="true" />
              ) : (
                <IconChevronDown size={16} className="text-text-secondary" aria-hidden="true" />
              )}
            </button>
            {packetOpen && (
              <>
                {packetQuery.data ? (
                  <pre className="max-h-64 overflow-y-auto rounded-control bg-background p-3 text-xs whitespace-pre-wrap text-text-primary">
                    {packetQuery.data.packet}
                  </pre>
                ) : (
                  <LoadingSkeleton label="Loading packet" className="h-32" />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!packetQuery.data}
                  onClick={() => {
                    if (!packetQuery.data) return;
                    const blob = new Blob([packetQuery.data.packet], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${caseId}-526EZ-packet.txt`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <IconDownload size={14} aria-hidden="true" />
                  Download 526EZ packet
                </Button>
              </>
            )}
          </section>
        </aside>
      </div>
    </VsoPageContainer>
  );
}
