// Shared display helpers for the VSO surfaces -- pure functions and lookup
// tables with no JSX, so both the inbox (app/(vso)/vso/page.tsx) and the
// case detail screen (app/(vso)/vso/cases/[caseId]/page.tsx) render the same
// urgency colors, the same readiness arithmetic, and the same category
// labels instead of each screen re-deriving its own copy (global CLAUDE.md
// "No duplication" -- one file to change if any of this wording moves).

import type { StatusVariant } from "@/components/shared/StatusTag";
import type {
  Branch,
  DischargeType,
  ReviewCategory,
  ReviewSuggestedState,
  RuleResultResponse,
  Urgency,
} from "@/lib/api/vso/types";

/** Wire enum -> human label for the veteran summary's service branch field. */
export const BRANCH_LABELS: Record<Branch, string> = {
  army: "Army",
  navy: "Navy",
  air_force: "Air Force",
  marine_corps: "Marine Corps",
  coast_guard: "Coast Guard",
  space_force: "Space Force",
  national_guard: "National Guard",
  reserves: "Reserves",
};

/** Wire enum -> human label for discharge type. */
export const DISCHARGE_LABELS: Record<DischargeType, string> = {
  honorable: "Honorable",
  general: "General",
  other_than_honorable: "Other than honorable",
  bad_conduct: "Bad conduct",
  dishonorable: "Dishonorable",
  uncharacterized: "Uncharacterized",
  unknown: "Unknown",
};

/** Deadline/ITF urgency -> StatusTag variant. Shared by the inbox's
 * per-row deadline column and the case detail rail's deadline list. */
export const URGENCY_VARIANT: Record<Urgency, StatusVariant> = {
  expired: "danger",
  urgent: "danger",
  soon: "warning",
  ok: "success",
  none: "pending",
  missing: "pending",
  info: "pending",
};

/**
 * Spells out readiness_score's arithmetic (src/evidence_rules.py) instead of
 * a bare number, per the plan's "never present a computed value as a
 * decision" -- a VSO can check the math in one glance rather than trust it.
 */
export function readinessBreakdown(
  requiredMissing: number,
  suggestedMissing: number,
  warningsCount: number,
  score: number,
): string {
  return `100 − (${requiredMissing}×20 required) − (${suggestedMissing}×5 suggested) − (${warningsCount}×5 warnings) = ${score}`;
}

/** Fixed render order for review-finding categories -- presumptive
 * eligibility leads (it's the fastest "verify, don't redo" win), missing
 * evidence trails (it's the one category with no computed finding to
 * confirm, just a gap to close). */
export const REVIEW_CATEGORY_ORDER: ReviewCategory[] = [
  "PRESUMPTIVE_ELIGIBILITY",
  "SERVICE_CONNECTION",
  "CURRENT_CONDITION",
  "MISSING_EVIDENCE",
];

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  PRESUMPTIVE_ELIGIBILITY: "Presumptive eligibility",
  SERVICE_CONNECTION: "Service connection",
  CURRENT_CONDITION: "Current condition",
  MISSING_EVIDENCE: "Missing evidence",
};

export const REVIEW_STATE_LABELS: Record<ReviewSuggestedState, string> = {
  CONFIRM: "Confirm",
  REJECT: "Reject",
  NEEDS_REVIEW: "Needs review",
};

/** A VSO's actual decision on a review card maps to a real StatusTag
 * variant (this is no longer a computed suggestion once clicked) --
 * "warning" for needs-review reads as "still open," not as an error. */
export const REVIEW_STATE_VARIANT: Record<ReviewSuggestedState, StatusVariant> = {
  CONFIRM: "success",
  REJECT: "danger",
  NEEDS_REVIEW: "warning",
};

/** A presumptive rule's MATCH/NO_MATCH/NOT_ENOUGH_DATA outcome (already a
 * finished, deterministic computation by the time it reaches this screen)
 * gets its own StatusTag treatment rather than being folded into prose. */
export const RULE_RESULT_VARIANT: Record<RuleResultResponse["result"], StatusVariant> = {
  MATCH: "success",
  NO_MATCH: "pending",
  NOT_ENOUGH_DATA: "warning",
};

export const RULE_RESULT_LABELS: Record<RuleResultResponse["result"], string> = {
  MATCH: "Match",
  NO_MATCH: "No match",
  NOT_ENOUGH_DATA: "Not enough data",
};

/**
 * Resolves a review item's `rule_result_ids` against the checklist's
 * `presumptive_hits` to recover each rule's plain-English explanation --
 * the provenance the plan calls "the spine of the review pane" (e.g. "Job
 * code 11B matched VA's published noise-exposure table"). Reads straight
 * from the backend-shaped explanation string rather than a hand-written
 * label, so what the VSO sees is literally the rule engine's own output,
 * not a paraphrase that could drift from it.
 */
export function resolveRuleProvenance(
  ruleResultIds: string[],
  presumptiveHits: RuleResultResponse[],
): RuleResultResponse[] {
  if (ruleResultIds.length === 0) return [];
  const byRuleId = new Map(presumptiveHits.map((hit) => [hit.rule_id, hit]));
  return ruleResultIds
    .map((id) => byRuleId.get(id))
    .filter((hit): hit is RuleResultResponse => hit !== undefined);
}
