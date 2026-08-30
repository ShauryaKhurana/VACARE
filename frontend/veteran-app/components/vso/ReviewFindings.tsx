"use client";

import { IconFileText, IconScale } from "@tabler/icons-react";
import { ComputedTag } from "@/components/shared/ComputedTag";
import { StatusTag } from "@/components/shared/StatusTag";
import { Button } from "@/components/ui/button";
import {
  REVIEW_CATEGORY_LABELS,
  REVIEW_CATEGORY_ORDER,
  REVIEW_STATE_LABELS,
  REVIEW_STATE_VARIANT,
  RULE_RESULT_LABELS,
  RULE_RESULT_VARIANT,
  resolveRuleProvenance,
} from "@/components/vso/vsoDisplay";
import type {
  ReviewItemResponse,
  ReviewSuggestedState,
  RuleResultResponse,
  VsoCaseEvidenceItem,
} from "@/lib/api/vso/types";
import { cn } from "@/lib/utils";

const DECISION_STATES: ReviewSuggestedState[] = ["CONFIRM", "NEEDS_REVIEW", "REJECT"];

/**
 * One review-finding card: the finding, its rule provenance (plain English,
 * pulled straight from the presumptive engine's own explanation text), its
 * evidence refs, and three decision buttons. `suggested_state` is shown only
 * via `ComputedTag` -- a computed hint, never rendered as if it were already
 * the VSO's answer -- and `decision` (this VSO's actual click) is the only
 * thing ever shown with a StatusTag, since that's a real decision, not a
 * guess. This split is the whole point of the "verify, don't redo" screen:
 * a VSO can tell at a glance what the system computed versus what a human
 * confirmed.
 */
function ReviewCard({
  item,
  presumptiveHits,
  evidenceById,
  decision,
  onDecide,
}: {
  item: ReviewItemResponse;
  presumptiveHits: RuleResultResponse[];
  evidenceById: Map<string, VsoCaseEvidenceItem>;
  decision: ReviewSuggestedState | undefined;
  onDecide: (state: ReviewSuggestedState) => void;
}) {
  const provenance = resolveRuleProvenance(item.rule_result_ids, presumptiveHits);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      {/* flex-wrap: at a narrow viewport combined with the accessibility
          text-scale control turned up, a long finding sentence left no room
          for ComputedTag on the same unbreakable row, pushing it past the
          viewport edge with no way to scroll back to it (confirmed via
          getBoundingClientRect, not just a screenshot glance). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-text-primary">{item.finding}</p>
        <ComputedTag className="shrink-0" />
      </div>

      {provenance.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-control bg-background px-3 py-2">
          {provenance.map((hit) => (
            <div key={hit.rule_id} className="flex items-start gap-2 text-xs text-text-secondary">
              <IconScale size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{hit.explanation}</span>
              <StatusTag variant={RULE_RESULT_VARIANT[hit.result]} label={RULE_RESULT_LABELS[hit.result]} />
            </div>
          ))}
        </div>
      )}

      {item.evidence_refs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.evidence_refs.map((ref) => {
            const ev = evidenceById.get(ref);
            return (
              <span
                key={ref}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-text-secondary"
              >
                <IconFileText size={12} aria-hidden="true" />
                {ev ? (ev.title ?? ev.evidence_type) : ref}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <ComputedTag label={`Suggested: ${REVIEW_STATE_LABELS[item.suggested_state]}`} />
          {decision && <StatusTag variant={REVIEW_STATE_VARIANT[decision]} label={REVIEW_STATE_LABELS[decision]} />}
        </div>
        {/* flex-wrap: three buttons (Confirm/Needs review/Reject) with no
            wrap meant that at mobile width + the accessibility text-scale
            control's higher settings, "Reject" -- and part of "Needs
            review" -- rendered up to 166px past the viewport's right edge,
            clipped by body's overflow-hidden with no way to reach or click
            it at all. Same class of bug as the sidebar's badge-overlap fix
            earlier this session; caught here by measuring rendered rects
            across the full viewport/scale matrix, not by eyeballing a
            screenshot. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Review decision">
          {DECISION_STATES.map((state) => (
            <Button
              key={state}
              type="button"
              size="sm"
              variant={decision === state ? "secondary" : "outline"}
              aria-pressed={decision === state}
              onClick={() => onDecide(state)}
            >
              {REVIEW_STATE_LABELS[state]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Review findings grouped by category (plan: "the spine of the review
 * pane") -- cards from getReviewItems(), each independently confirmable /
 * rejectable / flagged needs-review. Decisions live in the parent
 * (per-case, ephemeral) rather than this component, since there is no
 * backend field shaped for "a per-item CONFIRM/REJECT verdict" today: the
 * one real endpoint that looks adjacent (`POST /cases/{id}/review/{item_id}`)
 * takes a whole-claim VSOVerdict (pending/needs_more_info/approved_to_file),
 * not a per-finding state, so wiring this screen's three buttons to it would
 * silently misuse claim-level verdict semantics for a per-finding checkbox.
 * Flagged for the backend engineer; out of scope for this phase's mock.
 */
export function ReviewFindings({
  items,
  presumptiveHits,
  evidence,
  decisions,
  onDecide,
}: {
  items: ReviewItemResponse[];
  presumptiveHits: RuleResultResponse[];
  evidence: VsoCaseEvidenceItem[];
  decisions: Record<string, ReviewSuggestedState>;
  onDecide: (itemId: string, state: ReviewSuggestedState) => void;
}) {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const byCategory = new Map<string, ReviewItemResponse[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border bg-surface px-4 py-3 text-xs text-text-secondary">
        No computed findings for this case yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {REVIEW_CATEGORY_ORDER.filter((category) => (byCategory.get(category) ?? []).length > 0).map(
        (category) => (
          <section key={category} className="flex flex-col gap-2">
            <h3 className={cn("text-xs font-semibold tracking-wide text-text-secondary uppercase")}>
              {REVIEW_CATEGORY_LABELS[category]}
            </h3>
            <div className="flex flex-col gap-2">
              {(byCategory.get(category) ?? []).map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  presumptiveHits={presumptiveHits}
                  evidenceById={evidenceById}
                  decision={decisions[item.id]}
                  onDecide={(state) => onDecide(item.id, state)}
                />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
