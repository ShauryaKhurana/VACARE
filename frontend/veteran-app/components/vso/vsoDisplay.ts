// Shared display helpers for the VSO surfaces -- pure functions and lookup
// tables with no JSX, so both the inbox (app/(vso)/vso/page.tsx) and the
// case detail screen (app/(vso)/vso/cases/[caseId]/page.tsx) render the same
// urgency colors, the same readiness arithmetic, and the same category
// labels instead of each screen re-deriving its own copy (global CLAUDE.md
// "No duplication" -- one file to change if any of this wording moves).

import type { StatusVariant } from "@/components/shared/StatusTag";
import type { TriageLane } from "@/lib/api/vso/client";
import type { DeadlineFilter, SortKey } from "@/lib/store/vsoStore";
import type {
  Branch,
  ClaimStatus,
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

/** Thresholds in seconds under which a timestamp reads as "Nm ago"/"Nh ago"/
 * "Nd ago" -- past this, the day count stops being a useful mental unit
 * (plan: match Gmail/Front/Linear's relative-time convention), so the row
 * falls back to a short absolute date instead of e.g. "47d ago". */
const RELATIVE_TIME_DAY_CUTOFF = 30;

/**
 * Humanizes a timestamp for the inbox's "Last activity" column and the case
 * conversation's message rows -- both previously showed a bare date or a
 * fixed clock time, which doesn't answer the question a VSO scanning a
 * queue actually has ("how stale is this?") as quickly as "2d ago" does.
 * `now` is a parameter (not read internally via `new Date()`) purely so
 * this stays pure and testable against a fixed clock; every call site
 * outside tests just omits it.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  // Clock skew or a message with a slightly-future timestamp (mock latency
  // can land created_at a beat after the read) reads the same as "just
  // now" rather than a confusing negative duration.
  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < RELATIVE_TIME_DAY_CUTOFF) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/**
 * Two-letter initials for the inbox's/case header's avatar fallback --
 * first letter of the first and last name tokens, or the first two letters
 * of a single-word name. Never throws on empty/whitespace-only input (falls
 * back to "?"), since `veteran_name` is server-formatted text the UI must
 * still render something for.
 */
export function veteranInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** The inbox's full filter state -- search/sort/status/blockers (the raw
 * controls) plus which triage lane, if any, a promoted "view" has isolated,
 * plus the two sidebar-only dimensions (`deadlineFilter`, `unreadOnly`) that
 * cut across lanes rather than picking one. Centralized here (rather than
 * seven separate useState calls compared piecemeal) so "is anything
 * non-default" and "does this match a saved view/preset" have exactly one
 * shape to agree on. */
export interface InboxFilterState {
  search: string;
  sortKey: SortKey;
  statusFilter: ClaimStatus | "all";
  onlyBlockers: boolean;
  laneFilter: TriageLane | "all";
  deadlineFilter: DeadlineFilter;
  unreadOnly: boolean;
}

/** The inbox's out-of-the-box state -- what "Clear filters" resets to, and
 * what a case's absence of any active filter is compared against. */
export const DEFAULT_INBOX_FILTERS: InboxFilterState = {
  search: "",
  sortKey: "deadline",
  statusFilter: "all",
  onlyBlockers: false,
  laneFilter: "all",
  deadlineFilter: "all",
  unreadOnly: false,
};

/** True when every control is at its default -- gates the "Clear filters"
 * affordance (plan: only show it when there's something to clear) and
 * whether the built-in "All cases" view reads as currently active. Search
 * is trimmed so a stray space the veteran typed and deleted doesn't count
 * as an active filter. */
export function isFiltersDefault(filters: InboxFilterState): boolean {
  return (
    filters.search.trim() === DEFAULT_INBOX_FILTERS.search &&
    filters.sortKey === DEFAULT_INBOX_FILTERS.sortKey &&
    filters.statusFilter === DEFAULT_INBOX_FILTERS.statusFilter &&
    filters.onlyBlockers === DEFAULT_INBOX_FILTERS.onlyBlockers &&
    filters.laneFilter === DEFAULT_INBOX_FILTERS.laneFilter &&
    filters.deadlineFilter === DEFAULT_INBOX_FILTERS.deadlineFilter &&
    filters.unreadOnly === DEFAULT_INBOX_FILTERS.unreadOnly
  );
}

/**
 * Adds or removes one id from a selection set, immutably -- the inbox's
 * bulk-select checkboxes and "select all in lane" affordance both reduce to
 * this one operation. Returns a new Set rather than mutating so it's safe
 * to call directly from a setState updater.
 */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/**
 * Composes the default "request evidence" message for one case from its
 * actual missing-required-evidence labels -- feedback on the first version
 * of bulk requesting was that one identical, generic message to every
 * selected veteran ("please upload outstanding documents") wasn't honest
 * about what the tool actually knows: the checklist already has each
 * veteran's specific gap, and burying that behind a form-letter reads as
 * out of touch rather than efficient. Mirrors the single-case "Request from
 * veteran" button's own phrasing (case detail page) -- `Please provide: X`
 * -- so a veteran sees the same wording whether the ask came from a bulk
 * action or an individual one. Falls back to a still-honest generic line
 * only when the checklist has nothing specific to point to (e.g. a
 * "waiting on veteran" case where the open ask isn't itself a checklist
 * item), rather than fabricating a document name that isn't actually
 * missing.
 */
export function defaultEvidenceRequestText(missingRequiredLabels: string[]): string {
  if (missingRequiredLabels.length === 0) {
    return "Could you let us know the status of the information we last asked for? We want to keep your claim moving.";
  }
  if (missingRequiredLabels.length === 1) {
    return `Please provide: ${missingRequiredLabels[0]}.`;
  }
  const [last, ...rest] = [...missingRequiredLabels].reverse();
  return `Please provide: ${rest.reverse().join(", ")}, and ${last}.`;
}
