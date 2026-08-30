import { describe, it, expect } from "vitest";
import {
  applyInboxFilters,
  computeCaseloadOverview,
  computeSystemViewCounts,
  findSystemView,
  sortRows,
  SYSTEM_VIEWS,
  type CaseRow,
} from "@/components/vso/caseload";
import { DEFAULT_INBOX_FILTERS } from "@/components/vso/vsoDisplay";
import type { TriageLane } from "@/lib/api/vso/client";

/** Builds a minimal CaseRow with sane defaults, overridden per test --
 * mirrors the makeSubject/factory-helper convention this suite already uses
 * elsewhere (e.g. hasOpenInfoRequest's `task()` helper in vsoTriage.test.ts). */
function makeRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    claim_id: "case-1",
    veteran_name: "Jane Doe",
    status: "in_vso_review",
    created_on: "2026-08-01",
    conditions: "Tinnitus",
    lane: "needs_you",
    readiness_score: 60,
    required_missing: 1,
    suggested_missing: 0,
    warnings_count: 0,
    blockers: ["Missing required document: DD-214"],
    soonest_deadline: null,
    last_message: null,
    unread: false,
    ...overrides,
  };
}

describe("sortRows", () => {
  const rows = [
    makeRow({ claim_id: "old", created_on: "2026-01-01" }),
    makeRow({ claim_id: "new", created_on: "2026-08-20" }),
    makeRow({ claim_id: "mid", created_on: "2026-04-15" }),
  ];

  it("'recent' sorts newest created_on first", () => {
    const sorted = sortRows(rows, "recent");
    expect(sorted.map((r) => r.claim_id)).toEqual(["new", "mid", "old"]);
  });

  it("'age' sorts oldest created_on first -- the opposite of 'recent'", () => {
    const sorted = sortRows(rows, "age");
    expect(sorted.map((r) => r.claim_id)).toEqual(["old", "mid", "new"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortRows(rows, "recent");
    expect(rows).toEqual(original);
  });
});

describe("applyInboxFilters", () => {
  const rows: CaseRow[] = [
    makeRow({
      claim_id: "needs-you-urgent-unread",
      lane: "needs_you",
      blockers: ["Missing required document: DD-214"],
      soonest_deadline: { label: "ITF", due_on: "2026-09-10", days_remaining: 5, urgency: "urgent" },
      unread: true,
    }),
    makeRow({
      claim_id: "waiting-soon",
      lane: "waiting_on_veteran",
      blockers: [],
      soonest_deadline: { label: "ITF", due_on: "2026-10-01", days_remaining: 30, urgency: "soon" },
      unread: false,
    }),
    makeRow({
      claim_id: "ready-ok",
      lane: "ready_to_file",
      blockers: [],
      soonest_deadline: { label: "ITF", due_on: "2026-12-01", days_remaining: 90, urgency: "ok" },
      unread: false,
    }),
    makeRow({
      claim_id: "with-va-none",
      lane: "with_va",
      status: "submitted",
      blockers: [],
      soonest_deadline: null,
      unread: false,
    }),
  ];

  it("returns every row for the default (all-default) filter state", () => {
    expect(applyInboxFilters(rows, DEFAULT_INBOX_FILTERS)).toHaveLength(4);
  });

  it("isolates one triage lane via laneFilter", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, laneFilter: "needs_you" });
    expect(result.map((r) => r.claim_id)).toEqual(["needs-you-urgent-unread"]);
  });

  it("deadlineFilter 'approaching' matches both urgent and soon, nothing else", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, deadlineFilter: "approaching" });
    expect(result.map((r) => r.claim_id).sort()).toEqual(["needs-you-urgent-unread", "waiting-soon"]);
  });

  it("deadlineFilter 'urgent' matches only urgent, not soon", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, deadlineFilter: "urgent" });
    expect(result.map((r) => r.claim_id)).toEqual(["needs-you-urgent-unread"]);
  });

  it("deadlineFilter 'soon' matches only soon, not urgent", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, deadlineFilter: "soon" });
    expect(result.map((r) => r.claim_id)).toEqual(["waiting-soon"]);
  });

  it("a row with no deadline never matches a non-'all' deadlineFilter", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, deadlineFilter: "approaching" });
    expect(result.some((r) => r.claim_id === "with-va-none")).toBe(false);
  });

  it("unreadOnly keeps only rows with unread messages", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, unreadOnly: true });
    expect(result.map((r) => r.claim_id)).toEqual(["needs-you-urgent-unread"]);
  });

  it("combines laneFilter and deadlineFilter (AND, not OR)", () => {
    const result = applyInboxFilters(rows, {
      ...DEFAULT_INBOX_FILTERS,
      laneFilter: "waiting_on_veteran",
      deadlineFilter: "urgent",
    });
    expect(result).toHaveLength(0);
  });

  it("search matches veteran name, case id, or conditions, case-insensitively", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, search: "ready-ok" });
    expect(result.map((r) => r.claim_id)).toEqual(["ready-ok"]);
  });

  it("onlyBlockers keeps only rows with at least one blocker", () => {
    const result = applyInboxFilters(rows, { ...DEFAULT_INBOX_FILTERS, onlyBlockers: true });
    expect(result.map((r) => r.claim_id)).toEqual(["needs-you-urgent-unread"]);
  });
});

describe("SYSTEM_VIEWS / findSystemView", () => {
  it("every system view has a unique id", () => {
    const ids = SYSTEM_VIEWS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a view by id", () => {
    expect(findSystemView("needs_your_action")?.name).toBe("Needs your action");
  });

  it("returns undefined for an unknown id", () => {
    expect(findSystemView("not-a-real-view")).toBeUndefined();
  });

  it("returns undefined for a null/undefined id (no ?view= param present)", () => {
    expect(findSystemView(null)).toBeUndefined();
    expect(findSystemView(undefined)).toBeUndefined();
  });

  it("'all_cases' is the only view whose filters include the with_va lane", () => {
    const allCases = findSystemView("all_cases");
    expect(allCases?.filters.laneFilter).toBe("all");
  });

  it("every lane-isolating view's filters resolve back to that lane via applyInboxFilters", () => {
    const laneViews: [string, TriageLane][] = [
      ["needs_your_action", "needs_you"],
      ["waiting_on_veteran", "waiting_on_veteran"],
      ["ready_to_file", "ready_to_file"],
    ];
    const rows = laneViews.map(([, lane]) => makeRow({ claim_id: lane, lane }));
    for (const [viewId, lane] of laneViews) {
      const view = findSystemView(viewId);
      expect(view).toBeDefined();
      const result = applyInboxFilters(rows, view!.filters);
      expect(result.map((r) => r.lane)).toEqual([lane]);
    }
  });
});

describe("computeSystemViewCounts", () => {
  it("counts each system view against the same row list independently", () => {
    const rows: CaseRow[] = [
      makeRow({ claim_id: "a", lane: "needs_you" }),
      makeRow({ claim_id: "b", lane: "needs_you" }),
      makeRow({ claim_id: "c", lane: "ready_to_file", blockers: [] }),
    ];
    const counts = computeSystemViewCounts(rows);
    expect(counts.needs_your_action).toBe(2);
    expect(counts.ready_to_file).toBe(1);
    expect(counts.all_cases).toBe(3);
  });

  it("returns zero for every view against an empty row list", () => {
    const counts = computeSystemViewCounts([]);
    for (const view of SYSTEM_VIEWS) {
      expect(counts[view.id]).toBe(0);
    }
  });
});

describe("computeCaseloadOverview", () => {
  it("activeCount excludes the with_va lane", () => {
    const rows: CaseRow[] = [
      makeRow({ claim_id: "a", lane: "needs_you" }),
      makeRow({ claim_id: "b", lane: "with_va", status: "submitted" }),
    ];
    expect(computeCaseloadOverview(rows).activeCount).toBe(1);
  });

  it("urgentDeadlineCount equals the 'deadlines_approaching' system view's count", () => {
    const rows: CaseRow[] = [
      makeRow({
        claim_id: "a",
        soonest_deadline: { label: "ITF", due_on: "2026-09-10", days_remaining: 5, urgency: "urgent" },
      }),
      makeRow({
        claim_id: "b",
        soonest_deadline: { label: "ITF", due_on: "2026-12-01", days_remaining: 90, urgency: "ok" },
      }),
    ];
    const overview = computeCaseloadOverview(rows);
    const counts = computeSystemViewCounts(rows);
    expect(overview.urgentDeadlineCount).toBe(counts.deadlines_approaching);
    expect(overview.urgentDeadlineCount).toBe(1);
  });

  it("unreadCount equals the 'unread_activity' system view's count", () => {
    const rows: CaseRow[] = [
      makeRow({ claim_id: "a", unread: true }),
      makeRow({ claim_id: "b", unread: false }),
    ];
    const overview = computeCaseloadOverview(rows);
    expect(overview.unreadCount).toBe(1);
  });

  it("every count is zero for an empty caseload", () => {
    const overview = computeCaseloadOverview([]);
    expect(overview).toEqual({ activeCount: 0, urgentDeadlineCount: 0, unreadCount: 0 });
  });
});
