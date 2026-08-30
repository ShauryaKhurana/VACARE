"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVsoStore } from "@/lib/store/vsoStore";
import {
  computeCaseloadOverview,
  computeSystemViewCounts,
  loadCaseRows,
  type CaseloadOverview,
  type CaseRow,
} from "@/components/vso/caseload";

/**
 * The single ["vso-caseload"] query, shared by the inbox table
 * (app/(vso)/vso/page.tsx) and the sidebar (VsoSidebarNav, rendered from
 * app/(vso)/layout.tsx). Both call this same hook rather than each running
 * their own `useQuery` -- TanStack Query dedupes identical
 * key+fetcher subscriptions, so this guarantees one network/mock call and
 * one shared cache entry no matter how many components mount it, and a
 * mutation's `invalidateQueries(["vso-caseload"])` (case actions,
 * request-info, bulk send) refreshes both surfaces together.
 */
export function useCaseloadQuery() {
  const lastSeenMessageIds = useVsoStore((s) => s.lastSeenMessageIds);
  return useQuery({
    queryKey: ["vso-caseload"],
    queryFn: () => loadCaseRows(lastSeenMessageIds),
    // Matches the inbox page's own staleTime (see that file's comment):
    // avoids re-flashing the sidebar's counts on every route change within
    // the same session while still honoring an explicit invalidate.
    staleTime: 30_000,
  });
}

export interface CaseloadSummary {
  rows: CaseRow[];
  isLoading: boolean;
  overview: CaseloadOverview;
  /** SystemView id -> matching row count, for the sidebar's per-category
   * and per-sub-item badges. */
  viewCounts: Record<string, number>;
}

/**
 * Derives everything the sidebar needs to render (the Overview strip's three
 * numbers, and every category/sub-item's count badge) from the shared
 * caseload query -- kept separate from useCaseloadQuery so a consumer that
 * only wants the raw rows (the inbox table already has its own richer
 * grouping/sorting) isn't forced to pay for summary computation it doesn't
 * use.
 */
const EMPTY_ROWS: CaseRow[] = [];

export function useCaseloadSummary(): CaseloadSummary {
  const { data: rows, isLoading } = useCaseloadQuery();
  // A stable empty-array fallback (module-level, not `rows ?? []` inline) --
  // the inline form allocates a new array every render, which would defeat
  // the useMemo calls below every time `rows` is still undefined (e.g. the
  // whole time a fetch is loading).
  const rowsOrEmpty = rows ?? EMPTY_ROWS;

  const overview = useMemo(() => computeCaseloadOverview(rowsOrEmpty), [rowsOrEmpty]);
  const viewCounts = useMemo(() => computeSystemViewCounts(rowsOrEmpty), [rowsOrEmpty]);

  return { rows: rowsOrEmpty, isLoading, overview, viewCounts };
}
