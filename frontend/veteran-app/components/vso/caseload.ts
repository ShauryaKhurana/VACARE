// Shared caseload data + filtering logic for the VSO surfaces -- the
// row-shape, fetch, sort, and filter functions the inbox table
// (app/(vso)/vso/page.tsx) and the sidebar's category nav/Overview strip
// (VsoSidebarNav, in app/(vso)/layout.tsx) both need. Pulled out of the page
// component so the two consumers share one ["vso-caseload"] query and one
// filtering implementation instead of computing counts a second, possibly
// drifting, way (global CLAUDE.md "No duplication").

import { deriveTriageLane, hasOpenInfoRequest, vsoApiClient, type TriageLane } from "@/lib/api/vso/client";
import type { CaseMessageResponse, ClaimStatus, DeadlineResponse } from "@/lib/api/vso/types";
import { DEFAULT_INBOX_FILTERS, type InboxFilterState } from "@/components/vso/vsoDisplay";
import type { SortKey } from "@/lib/store/vsoStore";

/** One dense inbox row -- the union of everything the queue, checklist,
 * case, and message endpoints would each separately return for one case.
 * Building this client-side (rather than a single backend response) is a
 * direct consequence of plan constraint #1: no single endpoint returns a
 * per-case readiness+lane+deadline+activity view today. */
export interface CaseRow {
  claim_id: string;
  veteran_name: string;
  status: ClaimStatus;
  created_on: string;
  conditions: string;
  lane: TriageLane;
  readiness_score: number;
  required_missing: number;
  suggested_missing: number;
  warnings_count: number;
  blockers: string[];
  soonest_deadline: DeadlineResponse | null;
  last_message: CaseMessageResponse | null;
  unread: boolean;
}

/** Fetches the queue, then enriches every row in parallel -- the same shape
 * of work a real integration would do against separate endpoints (queue,
 * checklist, case, messages), just against the mock. Parallelized with
 * Promise.all rather than a loop so 12 mock cases resolve in one round of
 * the client's simulated latency instead of stacking it 12x. */
export async function loadCaseRows(lastSeenMessageIds: Record<string, string>): Promise<CaseRow[]> {
  const queue = await vsoApiClient.listQueue();
  return Promise.all(
    queue.map(async (item): Promise<CaseRow> => {
      const [checklist, vsoCase, messages] = await Promise.all([
        vsoApiClient.getChecklist(item.claim_id),
        vsoApiClient.getCase(item.claim_id),
        vsoApiClient.getMessages(item.claim_id),
      ]);

      const waitingOnVeteran = hasOpenInfoRequest(vsoCase.tasks);
      const lane = deriveTriageLane({
        status: item.status as ClaimStatus,
        vso_approved: vsoCase.vso_approved,
        blockers: checklist.blockers,
        waitingOnVeteran,
      });

      const requiredMissing = checklist.evidence_checklist.filter(
        (e) => e.required && !e.satisfied,
      ).length;
      const suggestedMissing = checklist.evidence_checklist.filter(
        (e) => !e.required && !e.satisfied,
      ).length;

      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const soonestDeadline =
        [...checklist.deadlines].sort(
          (a, b) => (a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity),
        )[0] ?? null;
      const unread = !!lastMessage && lastSeenMessageIds[item.claim_id] !== lastMessage.id;

      return {
        claim_id: item.claim_id,
        veteran_name: item.veteran_name,
        status: item.status as ClaimStatus,
        created_on: item.created_on,
        conditions: item.conditions,
        lane,
        readiness_score: checklist.readiness_score,
        required_missing: requiredMissing,
        suggested_missing: suggestedMissing,
        warnings_count: checklist.warnings.length,
        blockers: checklist.blockers,
        soonest_deadline: soonestDeadline,
        last_message: lastMessage,
        unread,
      };
    }),
  );
}

/** True when a deadline's urgency is one of the two the sidebar/Overview
 * strip call "approaching" -- shared so the "Deadlines approaching" system
 * view, its "Urgent"/"Soon" sub-items, and the Overview count all agree on
 * exactly the same two-urgency definition. */
function isApproachingDeadline(row: CaseRow): boolean {
  const urgency = row.soonest_deadline?.urgency;
  return urgency === "urgent" || urgency === "soon";
}

export type SortDirection = "asc" | "desc";

/** The base (ascending, in each key's own native sense) ordering for one
 * sort key -- direction is applied once, uniformly, by `sortRows` below via
 * a plain reverse, rather than every case needing its own asc/desc
 * comparator. Kept a separate function (not inlined into `sortRows`) so
 * clicking a column header for the first time and applying a saved
 * preset/system view both go through the exact same base ordering. */
function sortRowsAscending(rows: CaseRow[], sortKey: SortKey): CaseRow[] {
  const copy = [...rows];
  switch (sortKey) {
    case "readiness":
      return copy.sort((a, b) => a.readiness_score - b.readiness_score);
    case "activity":
      // "Ascending" here means the sense a VSO actually wants by default --
      // most recent activity first -- not literally earliest-timestamp
      // first; clicking the header again (desc) flips to oldest-first.
      return copy.sort((a, b) => {
        const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
        const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
        return bTime - aTime;
      });
    case "veteran":
      return copy.sort((a, b) => a.veteran_name.localeCompare(b.veteran_name));
    case "age":
      return copy.sort((a, b) => new Date(a.created_on).getTime() - new Date(b.created_on).getTime());
    case "recent":
      // The sidebar's "Recently assigned" category -- newest `created_on`
      // first, the opposite ordering of "age" above (which answers "what's
      // been sitting longest," not "what's new").
      return copy.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime());
    case "deadline":
    default:
      return copy.sort((a, b) => {
        const aDays = a.soonest_deadline?.days_remaining ?? Infinity;
        const bDays = b.soonest_deadline?.days_remaining ?? Infinity;
        return aDays - bDays;
      });
  }
}

export function sortRows(rows: CaseRow[], sortKey: SortKey, direction: SortDirection = "asc"): CaseRow[] {
  const sorted = sortRowsAscending(rows, sortKey);
  return direction === "desc" ? sorted.reverse() : sorted;
}

/**
 * Applies every dimension of InboxFilterState to a row list -- extracted
 * from the inbox page's own `filteredRows` so the sidebar can compute a
 * category's count by filtering the exact same ["vso-caseload"] rows the
 * exact same way, instead of the two surfaces maintaining parallel
 * filtering logic that could quietly drift apart. Sorting is deliberately
 * NOT done here -- callers that only need a count (the sidebar) skip it,
 * and the page applies `sortRows` itself, per lane, after this runs.
 */
export function applyInboxFilters(rows: CaseRow[], filters: InboxFilterState): CaseRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.laneFilter !== "all" && row.lane !== filters.laneFilter) return false;
    if (filters.statusFilter !== "all" && row.status !== filters.statusFilter) return false;
    if (filters.onlyBlockers && row.blockers.length === 0) return false;
    if (filters.unreadOnly && !row.unread) return false;
    if (filters.deadlineFilter === "approaching" && !isApproachingDeadline(row)) return false;
    if (
      filters.deadlineFilter !== "all" &&
      filters.deadlineFilter !== "approaching" &&
      row.soonest_deadline?.urgency !== filters.deadlineFilter
    ) {
      return false;
    }
    if (!query) return true;
    return (
      row.veteran_name.toLowerCase().includes(query) ||
      row.claim_id.toLowerCase().includes(query) ||
      row.conditions.toLowerCase().includes(query)
    );
  });
}

/**
 * One sidebar destination -- a fixed id (the `/vso?view=<id>` URL the
 * sidebar links to) plus the full InboxFilterState it applies. Deliberately
 * the same shape a FilterPreset carries (plan ask: "reuse FilterPreset's
 * shape as the model for these"), but these are NOT FilterPresets: they're
 * a fixed, built-in list a VSO can't rename or delete, so they live here as
 * plain constants rather than in vsoStore's persisted `filterPresets`.
 */
export interface SystemView {
  id: string;
  name: string;
  filters: InboxFilterState;
}

function systemView(id: string, name: string, overrides: Partial<InboxFilterState>): SystemView {
  return { id, name, filters: { ...DEFAULT_INBOX_FILTERS, ...overrides } };
}

/**
 * ---------------------------------------------------------------------
 * SonarQube's structure, not its vocabulary (see VsoSidebarNav's doc
 * comment for the full reasoning): every entry below maps a sidebar
 * category or sub-item to a filter combination over the SAME triage-lane /
 * deadline-urgency / unread signals the inbox table already computes per
 * row. There is deliberately no scored/graded view here -- a caseload
 * doesn't have a quality grade the way code does, so this list only ever
 * narrows by facts that already exist (lane, urgency, unread, recency),
 * never invents a new composite score to sort or badge by.
 * ---------------------------------------------------------------------
 *
 * "Needs your action" -> "Has blockers"/"Ready to review" was scoped as a
 * nice-to-have sub-split *if* cheaply derivable from the row. It technically
 * is (blockers are already on every row) but the split would be vacuous:
 * `deriveTriageLane` (lib/api/vso/client.ts) only ever buckets a case into
 * "needs_you" when `blockers.length > 0` -- a case with zero blockers is
 * *always* "ready_to_file" instead, a different lane entirely. So every row
 * in "needs_you" already has blockers, and a "Ready to review" sub-item here
 * would always render empty. Kept flat rather than shipping a sub-item that
 * can never match anything.
 */
export const SYSTEM_VIEWS: SystemView[] = [
  systemView("needs_your_action", "Needs your action", { laneFilter: "needs_you" }),

  systemView("deadlines_approaching", "Deadlines approaching", { deadlineFilter: "approaching" }),
  systemView("deadlines_urgent", "Urgent", { deadlineFilter: "urgent" }),
  systemView("deadlines_soon", "Soon", { deadlineFilter: "soon" }),

  // Sorted by last message activity (not the default deadline sort) -- the
  // freshest unread conversation belongs at the top of its own view.
  systemView("unread_activity", "Unread activity", { unreadOnly: true, sortKey: "activity" }),

  systemView("recently_assigned", "Recently assigned", { sortKey: "recent" }),

  systemView("waiting_on_veteran", "Waiting on veteran", { laneFilter: "waiting_on_veteran" }),
  systemView("ready_to_file", "Ready to file", { laneFilter: "ready_to_file" }),

  // Deliberately last and unfiltered -- the de-emphasized catch-all. This is
  // the only system view that still includes the "with_va" lane (decided/
  // submitted cases), matching the product decision that resolved cases
  // don't earn their own prominent category.
  systemView("all_cases", "All cases", {}),
];

export function findSystemView(id: string | null | undefined): SystemView | undefined {
  return SYSTEM_VIEWS.find((view) => view.id === id);
}

/** Every SYSTEM_VIEWS id -> how many currently-loaded rows match it. One
 * pass per view over the same `rows` array the inbox table renders, so a
 * sidebar badge and the table's own row count can never disagree. */
export function computeSystemViewCounts(rows: CaseRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const view of SYSTEM_VIEWS) {
    counts[view.id] = applyInboxFilters(rows, view.filters).length;
  }
  return counts;
}

/** The sidebar's compact top-of-rail stats strip (plan ask: "Overview...
 * doesn't dominate the rail"). Not a nav item -- just three numbers, each
 * defined in terms of a signal the rest of the sidebar already surfaces so
 * there's no fourth, bespoke definition to keep in sync. */
export interface CaseloadOverview {
  /** Every case not already "with_va" (submitted, decided, or approved) --
   * i.e. everything still on this VSO's actual desk. Deliberately excludes
   * the one lane the plan says isn't a priority to surface. */
  activeCount: number;
  /** Equal to the "Deadlines approaching" system view's count (urgent OR
   * soon) -- reusing computeSystemViewCounts rather than re-deriving the
   * urgent/soon union a second time. */
  urgentDeadlineCount: number;
  /** Equal to the "Unread activity" system view's count. */
  unreadCount: number;
}

export function computeCaseloadOverview(rows: CaseRow[]): CaseloadOverview {
  const counts = computeSystemViewCounts(rows);
  return {
    activeCount: rows.filter((row) => row.lane !== "with_va").length,
    urgentDeadlineCount: counts.deadlines_approaching ?? 0,
    unreadCount: counts.unread_activity ?? 0,
  };
}
