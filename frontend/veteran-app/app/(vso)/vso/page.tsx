"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconBookmarkPlus,
  IconChevronDown,
  IconChevronUp,
  IconClipboardList,
  IconFilter,
  IconInbox,
  IconMessageCircle2,
  IconRefresh,
  IconSearch,
  IconSquareCheck,
  IconX,
} from "@tabler/icons-react";
import { vsoApiClient, TRIAGE_LANE_LABELS, TRIAGE_LANE_ORDER, type TriageLane } from "@/lib/api/vso/client";
import {
  DEFAULT_INBOX_FILTERS,
  defaultEvidenceRequestText,
  formatRelativeTime,
  isFiltersDefault,
  readinessBreakdown,
  toggleSelection,
  URGENCY_VARIANT,
  veteranInitials,
  type InboxFilterState,
} from "@/components/vso/vsoDisplay";
import {
  applyInboxFilters,
  findSystemView,
  sortRows,
  type CaseRow,
  type SortDirection,
} from "@/components/vso/caseload";
import { useCaseloadQuery } from "@/components/vso/useCaseloadSummary";
import { caseMessagesKey } from "@/components/vso/CaseConversation";
import type { ClaimStatus } from "@/lib/api/vso/types";
import { VsoPageContainer } from "@/components/vso/VsoPageContainer";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { StatusTag } from "@/components/shared/StatusTag";
import { AccentButton } from "@/components/shared/AccentButton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVsoStore, type FilterPreset, type SortKey } from "@/lib/store/vsoStore";
import { cn } from "@/lib/utils";

// CaseRow, loadCaseRows, and sortRows now live in components/vso/caseload.ts
// -- shared with the sidebar's category counts (VsoSidebarNav) so both
// surfaces read the exact same ["vso-caseload"] query the exact same way.

const SORT_LABELS: Record<SortKey, string> = {
  deadline: "Deadline urgency",
  readiness: "Readiness (lowest first)",
  activity: "Last activity",
  age: "Oldest first",
  recent: "Recently assigned",
  veteran: "Veteran (A–Z)",
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Draft",
  ready_for_vso: "Ready for VSO",
  in_vso_review: "In VSO review",
  submitted: "Submitted",
  decided: "Decided",
};

/** Deadline labels are near-identical across most rows today (almost every
 * case's only deadline is the ITF window) -- shortened to a form code so
 * the column carries urgency at a glance instead of repeating the same
 * boilerplate phrase on every row. Falls back to the full label for any
 * deadline this map doesn't recognize, so nothing renders blank. */
const DEADLINE_SHORT_LABELS: Record<string, string> = {
  "Intent to File (21-0966) window": "ITF",
};

function shortDeadlineLabel(label: string): string {
  return DEADLINE_SHORT_LABELS[label] ?? label;
}

/** Only these two lanes get bulk-select checkboxes -- "ready to file" and
 * "with VA" cases aren't waiting on the veteran for anything, so there's
 * nothing to bulk-chase there (plan: the bottleneck is evidence-chasing,
 * not filing). */
function isBulkSelectableLane(lane: TriageLane): boolean {
  return lane === "needs_you" || lane === "waiting_on_veteran";
}

/** A lane pill's SYSTEM_VIEWS counterpart, for keeping the URL (and so the
 * sidebar's `?view=`-driven active highlight) in sync when a pill is
 * clicked directly on this page instead of from the sidebar -- the sidebar
 * already derives its active category from `?view=`, so updating it here is
 * what makes the sync bidirectional rather than sidebar-to-page only.
 * "with_va" has no sidebar category (product decision: resolved cases
 * aren't a priority destination), so it has no entry here. */
const LANE_TO_VIEW_ID: Partial<Record<TriageLane | "all", string>> = {
  all: "all_cases",
  needs_you: "needs_your_action",
  waiting_on_veteran: "waiting_on_veteran",
  ready_to_file: "ready_to_file",
};

/**
 * The three raw filter controls (sort/status/blockers-only) -- rendered
 * twice by the page below (inline on wider screens, inside a Popover on
 * narrow ones) so both breakpoints share one implementation instead of two
 * copies of the same three form controls drifting apart.
 */
function SecondaryFilterControls({
  className,
  showSort = true,
  sortKey,
  onSortKeyChange,
  statusFilter,
  onStatusFilterChange,
  onlyBlockers,
  onOnlyBlockersChange,
}: {
  className?: string;
  /** Desktop sorts via clickable column headers now (feedback: "the sort-by
   * dropdown is really just a filter chip for something a clickable header
   * already does better"); the table has no headers to click on a phone,
   * so the mobile Filters popover keeps this Select as its only way to
   * change sort. Defaults true so nothing silently disappears if a future
   * caller forgets to pass it. */
  showSort?: boolean;
  sortKey: SortKey;
  onSortKeyChange: (key: SortKey) => void;
  statusFilter: ClaimStatus | "all";
  onStatusFilterChange: (status: ClaimStatus | "all") => void;
  onlyBlockers: boolean;
  onOnlyBlockersChange: (checked: boolean) => void;
}) {
  return (
    <div className={className}>
      {showSort && (
        <Select value={sortKey} onValueChange={(value) => onSortKeyChange(value as SortKey)}>
          <SelectTrigger aria-label="Sort by" className="h-9 text-sm">
            {/* Base UI's Select.Value shows the raw value string unless told
                how to render it (unlike Radix, it doesn't remember the
                matching SelectItem's children) -- without this it displayed
                "deadline" instead of "Deadline urgency". */}
            <SelectValue placeholder="Sort">{(value: SortKey) => SORT_LABELS[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusFilterChange(value as ClaimStatus | "all")}
      >
        <SelectTrigger aria-label="Filter by status" className="h-9 text-sm">
          <SelectValue placeholder="Status">
            {(value: ClaimStatus | "all") => (value === "all" ? "All statuses" : STATUS_LABELS[value])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {(Object.keys(STATUS_LABELS) as ClaimStatus[]).map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <Checkbox
          checked={onlyBlockers}
          onCheckedChange={(checked) => onOnlyBlockersChange(checked === true)}
        />
        Has blockers only
      </label>
    </div>
  );
}

/** One clickable, sortable desktop column header (feedback: "why don't we
 * just make the columns clickable... only keep the actual filter chips for
 * things that can't simply be filtered by ordering, i.e. statuses" -- so
 * Veteran/Readiness/Deadline/Last activity became headers, and the old
 * sort-by dropdown's only remaining desktop job -- Status, Has-blockers --
 * are genuinely categorical, not an ordering, so they stayed as filter
 * controls). Clicking a column that isn't already active makes it the sort
 * key at its default (ascending, in that key's own sense -- see
 * sortRowsAscending's doc comment); clicking the already-active column
 * again flips direction instead of doing nothing. */
function SortableHead({
  label,
  ownKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  ownKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = ownKey === activeKey;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(ownKey)}
        aria-label={`Sort by ${label}${active ? (direction === "asc" ? ", ascending" : ", descending") : ""}`}
        className={cn(
          "flex items-center gap-1 rounded-control -mx-1 px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          active ? "font-semibold text-text-primary" : "hover:text-text-primary",
        )}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <IconChevronUp size={13} aria-hidden="true" />
          ) : (
            <IconChevronDown size={13} aria-hidden="true" />
          )
        ) : (
          <IconArrowsSort size={13} className="text-text-secondary/50" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}

/** The veteran's initials in a small colored circle -- replaces a bare name
 * string in every row/header that shows a veteran identity (plan: "Personable,
 * humanized data"), reusing the accent-tint treatment already used for
 * readiness/lane badges elsewhere on this page rather than inventing a new
 * color pairing. */
function VeteranAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar size={size} className="shrink-0">
      <AvatarFallback className="bg-accent-tint font-medium text-accent">
        {veteranInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** One case, collapsed into a stacked card -- the same fields the table's
 * columns show, in a vertical layout that reads on a phone-width screen
 * instead of relying on horizontal scroll. Rendered only below `md`; the
 * table above `md` is untouched. No tooltip on the readiness badge here
 * (unlike the table's) -- tooltips need a hover state a touch screen
 * doesn't have, so the number stands alone.
 *
 * The selection checkbox sits *outside* the row's own `<button>` (a sibling,
 * not a nested control) -- a checkbox nested inside a button is invalid
 * markup and would double-fire (toggle selection AND navigate) on every
 * tap, so the card is a `<div>` wrapping a checkbox plus the button. */
function CaseRowCard({
  row,
  onOpen,
  selectable,
  selected,
  onToggleSelect,
}: {
  row: CaseRow;
  onOpen: (claimId: string) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (claimId: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(row.claim_id)}
          aria-label={`Select case for ${row.veteran_name}`}
          className="mt-3.5 shrink-0"
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(row.claim_id)}
        aria-label={`Open case for ${row.veteran_name}`}
        className="flex min-w-0 w-full flex-col gap-1.5 rounded-card border border-border bg-surface p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-primary">
            {row.unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread message" />
            )}
            <VeteranAvatar name={row.veteran_name} />
            <span className="truncate">{row.veteran_name}</span>
          </span>
          <span className="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
            {row.readiness_score}/100
          </span>
        </div>
        <span className="font-mono text-xs text-text-secondary">{row.claim_id}</span>
        <span className="truncate text-xs text-text-secondary">{row.conditions}</span>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {row.soonest_deadline ? (
            <StatusTag
              variant={URGENCY_VARIANT[row.soonest_deadline.urgency]}
              label={
                row.soonest_deadline.days_remaining != null
                  ? `${shortDeadlineLabel(row.soonest_deadline.label)} · ${row.soonest_deadline.days_remaining}d`
                  : shortDeadlineLabel(row.soonest_deadline.label)
              }
            />
          ) : (
            <span className="text-xs text-text-secondary">—</span>
          )}
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            {row.last_message && <IconMessageCircle2 size={12} aria-hidden="true" />}
            {formatRelativeTime(row.last_message ? row.last_message.created_at : row.created_on)}
          </span>
        </div>
      </button>
    </div>
  );
}

/**
 * The caseload inbox -- the daily driver (plan Screen 1). Answers "where do
 * the next two hours go?" with triage lanes as the primary grouping rather
 * than a flat table, dense rows built for scanning, and j/k/Enter//
 * keyboard navigation, since this is a throughput tool for a professional,
 * the visual inverse of the roomy veteran app. Below `md`, lanes render as
 * stacked CaseRowCards instead of the table -- a touch screen has no j/k
 * keys anyway, so the keyboard nav below stays desktop-only by construction.
 *
 * Wrapped in Suspense (default export below) because it reads `?view=` via
 * useSearchParams -- same pattern app/(main)/claim/page.tsx already uses,
 * required so this route doesn't opt the whole page out of static
 * rendering just for one query param read.
 */
function VsoInboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const identity = useVsoStore((s) => s.identity);
  const filterPresets = useVsoStore((s) => s.filterPresets);
  const savePreset = useVsoStore((s) => s.savePreset);
  const deletePreset = useVsoStore((s) => s.deletePreset);
  const vsoName = identity?.name ?? "VSO";

  // Shared with the sidebar (components/vso/useCaseloadSummary.ts) -- same
  // queryKey, same queryFn, so TanStack Query serves both from one
  // subscription instead of two independent fetches of the same data.
  const { data: rows, isLoading } = useCaseloadQuery();

  const [search, setSearch] = useState(DEFAULT_INBOX_FILTERS.search);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_INBOX_FILTERS.sortKey);
  // Not part of InboxFilterState/FilterPreset -- direction is a transient
  // display preference on top of whichever key is active, not part of what
  // makes a saved view or preset "the same" one (see isPresetActive/
  // isLaneViewActive below, which deliberately don't compare it).
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">(DEFAULT_INBOX_FILTERS.statusFilter);
  const [onlyBlockers, setOnlyBlockers] = useState(DEFAULT_INBOX_FILTERS.onlyBlockers);
  // Which triage lane a promoted "view" has isolated -- "all" renders every
  // lane (today's default), same as before views existed.
  const [laneFilter, setLaneFilter] = useState<TriageLane | "all">(DEFAULT_INBOX_FILTERS.laneFilter);
  // The two sidebar-only filter dimensions -- set only by a system view/
  // preset (applyFilters below), never by a raw control on this page, the
  // same way laneFilter was introduced a round ago.
  const [deadlineFilter, setDeadlineFilter] = useState(DEFAULT_INBOX_FILTERS.deadlineFilter);
  const [unreadOnly, setUnreadOnly] = useState(DEFAULT_INBOX_FILTERS.unreadOnly);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameDraft, setPresetNameDraft] = useState("");

  // Selection checkboxes are opt-in (feedback: "should be something you can
  // turn off/on, like Gmail") rather than permanent columns/decoration on
  // every row -- off by default, so the common case (open one case, act on
  // it) reads as a plain list, not a bulk-triage tool by default.
  const [selectMode, setSelectMode] = useState(false);
  // Bulk selection -- ids the VSO has checked across the "needs you"/
  // "waiting on veteran" lanes, cleared after a successful bulk send.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkComposerOpen, setBulkComposerOpen] = useState(false);
  // claim_id -> that veteran's own editable request text -- deliberately
  // per-case, not one shared string, so a bulk send is a batch of
  // individually-worded messages rather than one form letter blasted at
  // everyone selected (see defaultEvidenceRequestText's doc comment).
  const [bulkRequestTexts, setBulkRequestTexts] = useState<Record<string, string>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // applyInboxFilters (components/vso/caseload.ts) is the same function the
  // sidebar uses to compute its category counts -- keeping this call (not a
  // second inline filter) is what guarantees the sidebar's badge and this
  // table's row count never disagree.
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return applyInboxFilters(rows, {
      search,
      sortKey,
      statusFilter,
      onlyBlockers,
      laneFilter,
      deadlineFilter,
      unreadOnly,
    });
  }, [rows, search, sortKey, statusFilter, onlyBlockers, laneFilter, deadlineFilter, unreadOnly]);

  // Which lane sections actually render -- every lane normally, or just the
  // one a view/preset isolated. Keeps "Nothing in this lane" from printing
  // for three lanes a VSO deliberately filtered away.
  const visibleLanes = useMemo(
    () => (laneFilter === "all" ? TRIAGE_LANE_ORDER : [laneFilter]),
    [laneFilter],
  );

  /** Rows grouped by triage lane, in the plan's fixed lane order, sorted
   * within each lane by the active sort key -- this is what actually
   * renders, and also defines j/k traversal order (flatRows below). */
  const groupedRows = useMemo(() => {
    const groups = new Map<TriageLane, CaseRow[]>();
    for (const lane of visibleLanes) groups.set(lane, []);
    for (const row of filteredRows) {
      if (groups.has(row.lane)) groups.get(row.lane)?.push(row);
    }
    for (const lane of visibleLanes) {
      groups.set(lane, sortRows(groups.get(lane) ?? [], sortKey, sortDirection));
    }
    return groups;
  }, [filteredRows, sortKey, sortDirection, visibleLanes]);

  const flatRows = useMemo(
    () => visibleLanes.flatMap((lane) => groupedRows.get(lane) ?? []),
    [groupedRows, visibleLanes],
  );

  // Per-lane totals against the *unfiltered* queue -- the count badge next
  // to each promoted view, same convention the lane-group headers below
  // already use for their own (filtered) counts.
  const laneCounts = useMemo(() => {
    const counts = new Map<TriageLane, number>();
    for (const lane of TRIAGE_LANE_ORDER) counts.set(lane, 0);
    for (const row of rows ?? []) {
      counts.set(row.lane, (counts.get(row.lane) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  // Only rows still visible under the active filters can be bulk-acted on --
  // a selection made before a filter change doesn't silently apply to rows
  // the VSO can no longer see.
  const selectedRows = useMemo(
    () => flatRows.filter((row) => selectedIds.has(row.claim_id)),
    [flatRows, selectedIds],
  );

  const toggleRowSelection = useCallback((claimId: string) => {
    setSelectedIds((prev) => toggleSelection(prev, claimId));
  }, []);

  // Turning select mode off also drops any selection -- a hidden, invisible
  // set of checked cases lingering after the checkboxes disappear would be
  // a trap the next time select mode is turned back on.
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  /** Clicking a column header: first click on a new column sorts by it
   * ascending; clicking the already-active column again flips direction. */
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDirection("asc");
      }
    },
    [sortKey],
  );

  // Clamped at render time rather than synced back into state via an
  // effect -- filtering/sorting can shrink flatRows on any keystroke, and
  // re-deriving the visible index here avoids a render -> effect -> render
  // cascade for what is really just a read-time bounds check.
  const focusedIndexClamped =
    flatRows.length === 0 ? 0 : Math.min(focusedIndex, flatRows.length - 1);

  useEffect(() => {
    rowRefs.current[focusedIndexClamped]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndexClamped]);

  const openCase = useCallback(
    (claimId: string) => {
      // Phase 2 builds /vso/cases/[caseId]; wiring the interaction now keeps
      // the keyboard/click contract correct for when that route lands.
      router.push(`/vso/cases/${claimId}`);
    },
    [router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (isTyping) return;

      if (event.key === "j") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, flatRows.length - 1));
      } else if (event.key === "k") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        const row = flatRows[focusedIndexClamped];
        if (row) openCase(row.claim_id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flatRows, focusedIndexClamped, openCase]);

  const currentFilters: InboxFilterState = {
    search,
    sortKey,
    statusFilter,
    onlyBlockers,
    laneFilter,
    deadlineFilter,
    unreadOnly,
  };
  const filtersAreDefault = isFiltersDefault(currentFilters);
  const secondaryActiveCount =
    (sortKey !== DEFAULT_INBOX_FILTERS.sortKey ? 1 : 0) +
    (statusFilter !== DEFAULT_INBOX_FILTERS.statusFilter ? 1 : 0) +
    (onlyBlockers !== DEFAULT_INBOX_FILTERS.onlyBlockers ? 1 : 0);

  /** Overwrites every filter control at once from a full InboxFilterState --
   * a view or preset is a snapshot of the whole combination, not a single
   * value, so applying one always replaces the full set rather than merging
   * into whatever's active. The one function every "jump to a filtered
   * view" entry point (the lane chips below, a saved preset, a sidebar
   * category/`?view=` link) funnels through, so there's exactly one place
   * that knows how to apply an InboxFilterState. Wrapped in useCallback with
   * an empty dep array -- every setter it calls has a stable identity from
   * useState, so this function's own identity never needs to change, which
   * matters for the `?view=` effect below (its dependency array can name
   * this function without re-running on every render). */
  const applyFilters = useCallback((filters: InboxFilterState) => {
    setSearch(filters.search);
    setSortKey(filters.sortKey);
    setSortDirection("asc");
    setStatusFilter(filters.statusFilter);
    setOnlyBlockers(filters.onlyBlockers);
    setLaneFilter(filters.laneFilter);
    setDeadlineFilter(filters.deadlineFilter);
    setUnreadOnly(filters.unreadOnly);
  }, []);

  // Applies a sidebar category's filters when the inbox is opened via
  // `/vso?view=<id>` (the sidebar's VsoSidebarNav links here) -- the same
  // SystemView lookup (components/vso/caseload.ts) the sidebar uses to
  // compute its own counts, so a click always lands on exactly the rows the
  // sidebar badge promised. An unrecognized/missing `view` param is a no-op
  // rather than an error -- a plain `/vso` visit has no `view` param at all.
  useEffect(() => {
    const view = findSystemView(searchParams.get("view"));
    if (view) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local filter state to the `?view=` URL param IS the synchronization this effect exists for (same pattern this layout's own mount-gate effect uses).
      applyFilters(view.filters);
    }
  }, [searchParams, applyFilters]);

  /** A built-in view isolating one triage lane (or "all") is "active" when
   * the lane matches and every other control sits at its default -- the
   * same bar a saved preset would need to clear, just without needing an
   * entry in filterPresets. */
  function isLaneViewActive(lane: TriageLane | "all"): boolean {
    return (
      laneFilter === lane &&
      search.trim() === DEFAULT_INBOX_FILTERS.search &&
      sortKey === DEFAULT_INBOX_FILTERS.sortKey &&
      statusFilter === DEFAULT_INBOX_FILTERS.statusFilter &&
      onlyBlockers === DEFAULT_INBOX_FILTERS.onlyBlockers &&
      deadlineFilter === DEFAULT_INBOX_FILTERS.deadlineFilter &&
      unreadOnly === DEFAULT_INBOX_FILTERS.unreadOnly
    );
  }

  function isPresetActive(preset: FilterPreset): boolean {
    return (
      search === preset.search &&
      sortKey === preset.sortKey &&
      statusFilter === preset.statusFilter &&
      onlyBlockers === preset.onlyBlockers &&
      laneFilter === (preset.laneFilter ?? "all") &&
      deadlineFilter === (preset.deadlineFilter ?? "all") &&
      unreadOnly === (preset.unreadOnly ?? false)
    );
  }

  /** Isolates one lane (or clears back to "all") and resets every other
   * control to default -- a view is a fixed destination, not a merge with
   * whatever the VSO happened to have typed in search. Also pushes the
   * matching `?view=` into the URL (when the lane has a sidebar
   * counterpart) so the sidebar's active-category highlight stays correct
   * no matter which surface -- sidebar or this page's own pills -- the VSO
   * clicked from. `replace`, not `push`: choosing a different view isn't a
   * new navigation step worth its own back-button entry. */
  function applyView(lane: TriageLane | "all") {
    applyFilters({ ...DEFAULT_INBOX_FILTERS, laneFilter: lane });
    const viewId = LANE_TO_VIEW_ID[lane];
    if (viewId) router.replace(`/vso?view=${viewId}`, { scroll: false });
  }

  /** `laneFilter`/`deadlineFilter`/`unreadOnly` fall back to their defaults
   * for a preset saved before that field existed (see FilterPreset's doc
   * comment). */
  function applyPreset(preset: FilterPreset) {
    applyFilters({
      search: preset.search,
      sortKey: preset.sortKey,
      statusFilter: preset.statusFilter,
      onlyBlockers: preset.onlyBlockers,
      laneFilter: preset.laneFilter ?? "all",
      deadlineFilter: preset.deadlineFilter ?? "all",
      unreadOnly: preset.unreadOnly ?? false,
    });
  }

  // Clearing is the same destination as the "All cases" view -- reuse
  // applyView so the URL (and sidebar highlight) update the same way.
  function clearFilters() {
    applyView("all");
  }

  function handleSavePreset(event: React.FormEvent) {
    event.preventDefault();
    const name = presetNameDraft.trim();
    if (!name) return;
    savePreset(name, { search, sortKey, statusFilter, onlyBlockers, laneFilter, deadlineFilter, unreadOnly });
    setPresetNameDraft("");
    setSavingPreset(false);
  }

  // Fetches each selected case's own checklist when the composer opens, so
  // the per-veteran default text below can name what THAT veteran is
  // actually missing rather than a form letter every selected case shares.
  // Keyed on the selected ids (not just "is the composer open") so
  // selecting a different pair of cases refetches instead of reusing a
  // stale prefill from the previous selection.
  const selectedIdsKey = selectedRows.map((row) => row.claim_id).sort().join(",");
  const bulkPrefillQuery = useQuery({
    queryKey: ["vso-bulk-evidence-prefill", selectedIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        selectedRows.map(async (row) => {
          const checklist = await vsoApiClient.getChecklist(row.claim_id);
          const missingRequiredLabels = checklist.evidence_checklist
            .filter((item) => item.required && !item.satisfied)
            .map((item) => `${item.label}${item.condition_name ? ` (${item.condition_name})` : ""}`);
          return [row.claim_id, defaultEvidenceRequestText(missingRequiredLabels)] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
    enabled: bulkComposerOpen && selectedRows.length >= 2,
  });

  // `bulkRequestTexts` holds only the VSO's own edits (an override map) --
  // the value a textarea actually shows falls back to that case's fetched
  // default, so there's no effect syncing query data into state (and no
  // risk of an edit getting clobbered by a refetch): the override, once
  // typed, simply always wins.
  const bulkText = useCallback(
    (claimId: string) => bulkRequestTexts[claimId] ?? bulkPrefillQuery.data?.[claimId] ?? "",
    [bulkRequestTexts, bulkPrefillQuery.data],
  );

  const allBulkTextsFilled =
    selectedRows.length > 0 && selectedRows.every((row) => bulkText(row.claim_id).trim().length > 0);

  const bulkRequestEvidence = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selectedRows.map((row) =>
          vsoApiClient.requestInfo(row.claim_id, {
            reviewer_name: vsoName,
            request_text: bulkText(row.claim_id).trim(),
          }),
        ),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vso-caseload"] });
      for (const row of selectedRows) {
        void queryClient.invalidateQueries({ queryKey: caseMessagesKey(row.claim_id) });
      }
      setSelectedIds(new Set());
      setBulkComposerOpen(false);
      setBulkRequestTexts({});
    },
  });

  return (
    <TooltipProvider>
      <VsoPageContainer className="gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Caseload</h1>
            <p className="text-sm text-text-secondary">
              {identity ? `Signed in as ${identity.name}, ${identity.organization}` : "Shared VSO queue"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Off by default (feedback: "should be something you can turn
                off/on, like Gmail") -- selection checkboxes are a
                bulk-triage mode a VSO opts into, not a permanent column on
                every row. */}
            <Button
              type="button"
              variant={selectMode ? "secondary" : "outline"}
              size="sm"
              aria-pressed={selectMode}
              onClick={toggleSelectMode}
            >
              <IconSquareCheck size={16} aria-hidden="true" />
              {selectMode ? "Selecting" : "Select"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["vso-caseload"] })}
            >
              <IconRefresh size={16} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Promoted views -- one-click destinations (plan: Linear/Salesforce
            "Views"), not a filter form the VSO rebuilds every visit. The
            four triage lanes get a built-in view each; a VSO's own saved
            presets sit in the same row at the same visual weight, since
            both are just named shortcuts into the same five-field filter
            state. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyView("all")}
            aria-pressed={isLaneViewActive("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              isLaneViewActive("all")
                ? "border-accent bg-accent-tint text-accent"
                : "border-border bg-surface text-text-primary hover:border-accent hover:text-accent",
            )}
          >
            All cases <span className="text-text-secondary">{rows?.length ?? 0}</span>
          </button>
          {TRIAGE_LANE_ORDER.map((lane) => {
            const active = isLaneViewActive(lane);
            return (
              <button
                key={lane}
                type="button"
                onClick={() => applyView(lane)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent-tint text-accent"
                    : "border-border bg-surface text-text-primary hover:border-accent hover:text-accent",
                )}
              >
                {TRIAGE_LANE_LABELS[lane]} <span className="text-text-secondary">{laneCounts.get(lane) ?? 0}</span>
              </button>
            );
          })}

          {filterPresets.length > 0 && <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />}

          {filterPresets.map((preset) => {
            const active = isPresetActive(preset);
            return (
              <div
                key={preset.id}
                className={cn(
                  "group flex items-center overflow-hidden rounded-full border text-xs",
                  active ? "border-accent bg-accent-tint text-accent" : "border-border bg-surface text-text-primary",
                )}
              >
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  className="px-3 py-1.5 font-medium hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset(preset.id)}
                  aria-label={`Delete view ${preset.name}`}
                  className="flex h-full items-center px-2 text-text-secondary/70 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconX size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}

          {savingPreset ? (
            <form onSubmit={handleSavePreset} className="flex items-center gap-1.5">
              <label htmlFor="preset-name" className="sr-only">
                View name
              </label>
              <input
                id="preset-name"
                autoFocus
                value={presetNameDraft}
                onChange={(e) => setPresetNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSavingPreset(false);
                    setPresetNameDraft("");
                  }
                }}
                placeholder="View name"
                className="w-36 rounded-control border border-border bg-background px-2 py-1 text-xs text-text-primary outline-none focus-visible:border-accent"
              />
              <button
                type="submit"
                className="text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavingPreset(false);
                  setPresetNameDraft("");
                }}
                className="text-xs text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSavingPreset(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconBookmarkPlus size={13} aria-hidden="true" />
              Save current view
            </button>
          )}
        </div>

        {/* Raw search/sort/status/blockers controls -- secondary to the
            views row above. Search stays full-width and always visible;
            sort/status/blockers collapse into a Popover behind a "Filters"
            button below `sm` instead of forcing four controls onto one
            390px-wide line (the bug this replaced). */}
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by veteran, case id, or condition ( / )"
              aria-label="Search caseload"
              className="w-full rounded-control border border-border bg-background py-2 pr-3 pl-9 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SecondaryFilterControls
              className="hidden items-center gap-2 sm:flex"
              sortKey={sortKey}
              onSortKeyChange={setSortKey}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onlyBlockers={onlyBlockers}
              onOnlyBlockersChange={setOnlyBlockers}
            />

            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" className="sm:hidden" />}>
                <IconFilter size={14} aria-hidden="true" />
                Filters
                {secondaryActiveCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                    {secondaryActiveCount}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <SecondaryFilterControls
                  className="flex flex-col gap-3"
                  sortKey={sortKey}
                  onSortKeyChange={setSortKey}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  onlyBlockers={onlyBlockers}
                  onOnlyBlockersChange={setOnlyBlockers}
                />
              </PopoverContent>
            </Popover>

            {!filtersAreDefault && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <IconX size={14} aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {/* Bulk action toolbar -- appears once 2+ cases are checked (plan:
            "Bulk selection + bulk Request evidence", the throughput fix for
            chasing missing evidence one case at a time). Sticky so it stays
            reachable while scrolling a long lane. */}
        {selectedRows.length >= 2 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/40 bg-accent-tint px-4 py-2.5">
            <span className="text-sm font-medium text-accent">
              {selectedRows.length} cases selected
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
              <AccentButton
                type="button"
                className="h-8 gap-1.5 px-3 text-sm"
                onClick={() => setBulkComposerOpen(true)}
              >
                <IconClipboardList size={15} aria-hidden="true" />
                Request evidence
              </AccentButton>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <LoadingSkeleton label="Loading caseload" />
            <LoadingSkeleton label="Loading caseload" />
            <LoadingSkeleton label="Loading caseload" />
          </div>
        ) : flatRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface p-10 text-center">
            <IconInbox size={28} className="text-text-secondary" aria-hidden="true" />
            <p className="text-sm font-medium text-text-primary">No cases match these filters</p>
            <p className="text-xs text-text-secondary">Clear the search or filters to see the full queue.</p>
          </div>
        ) : (
          <>
            {/* Mobile/tablet: lanes as stacked cards, not a horizontally-
                scrolled table -- a dense grid of columns doesn't collapse
                to a usable phone layout by just letting it scroll sideways. */}
            <div className="flex flex-col gap-5 md:hidden">
              {visibleLanes.map((lane) => {
                const laneRows = groupedRows.get(lane) ?? [];
                const selectable = selectMode && isBulkSelectableLane(lane);
                return (
                  <div key={lane} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                        {TRIAGE_LANE_LABELS[lane]}
                      </span>
                      <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
                        {laneRows.length}
                      </span>
                    </div>
                    {laneRows.length === 0 ? (
                      <p className="px-0.5 text-xs text-text-secondary">Nothing in this lane.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {laneRows.map((row) => (
                          <CaseRowCard
                            key={row.claim_id}
                            row={row}
                            onOpen={openCase}
                            selectable={selectable}
                            selected={selectedIds.has(row.claim_id)}
                            onToggleSelect={toggleRowSelection}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop (md:+): the dense table, unchanged. One table, one
                header row -- the column headers used to repeat in full under
                every one of the four triage lanes. Lanes are now full-width
                group rows inside a single TableBody instead of four separate
                tables, so "Veteran / Case / Conditions / ..." prints exactly
                once regardless of how many lanes have rows. */}
            <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Selection column only exists in select mode -- collapses
                      away entirely (not just hidden) rather than leaving an
                      empty gap when it's off. */}
                  {selectMode && <TableHead className="w-8" />}
                  <SortableHead
                    label="Veteran"
                    ownKey="veteran"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <TableHead>Case</TableHead>
                  <TableHead>Conditions</TableHead>
                  <SortableHead
                    label="Readiness"
                    ownKey="readiness"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Deadline"
                    ownKey="deadline"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Last activity"
                    ownKey="activity"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLanes.map((lane) => {
                  const laneRows = groupedRows.get(lane) ?? [];
                  const selectable = selectMode && isBulkSelectableLane(lane);
                  return (
                    <Fragment key={lane}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={selectMode ? 7 : 6} className="bg-background py-2">
                          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
                            {TRIAGE_LANE_LABELS[lane]}
                            <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
                              {laneRows.length}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {laneRows.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={selectMode ? 7 : 6} className="py-3 text-xs text-text-secondary">
                            Nothing in this lane.
                          </TableCell>
                        </TableRow>
                      ) : (
                        laneRows.map((row) => {
                          const flatIndex = flatRows.indexOf(row);
                          const isFocused = flatIndex === focusedIndexClamped;
                          return (
                            <TableRow
                              key={row.claim_id}
                              ref={(el) => {
                                rowRefs.current[flatIndex] = el;
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label={`Open case for ${row.veteran_name}`}
                              onClick={() => openCase(row.claim_id)}
                              onFocus={() => setFocusedIndex(flatIndex)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") openCase(row.claim_id);
                              }}
                              className={cn(
                                "cursor-pointer",
                                isFocused && "bg-accent-tint/60 outline-2 outline-offset-[-2px] outline-accent",
                              )}
                            >
                              {selectMode && (
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  {selectable && (
                                    <Checkbox
                                      checked={selectedIds.has(row.claim_id)}
                                      onCheckedChange={() => toggleRowSelection(row.claim_id)}
                                      aria-label={`Select case for ${row.veteran_name}`}
                                    />
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-text-primary">
                                <span className="flex items-center gap-2">
                                  {row.unread && (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-accent"
                                      aria-label="Unread message"
                                    />
                                  )}
                                  <VeteranAvatar name={row.veteran_name} />
                                  {row.veteran_name}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-text-secondary">
                                {row.claim_id}
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate text-text-secondary" title={row.conditions}>
                                {row.conditions}
                              </TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger
                                    className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {row.readiness_score}/100
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {readinessBreakdown(
                                      row.required_missing,
                                      row.suggested_missing,
                                      row.warnings_count,
                                      row.readiness_score,
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                {row.soonest_deadline ? (
                                  <StatusTag
                                    variant={URGENCY_VARIANT[row.soonest_deadline.urgency]}
                                    label={
                                      row.soonest_deadline.days_remaining != null
                                        ? `${shortDeadlineLabel(row.soonest_deadline.label)} · ${row.soonest_deadline.days_remaining}d`
                                        : shortDeadlineLabel(row.soonest_deadline.label)
                                    }
                                  />
                                ) : (
                                  <span className="text-xs text-text-secondary">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-text-secondary">
                                {row.last_message ? (
                                  <span className="flex items-center gap-1">
                                    <IconMessageCircle2 size={14} aria-hidden="true" />
                                    {formatRelativeTime(row.last_message.created_at)}
                                  </span>
                                ) : (
                                  formatRelativeTime(row.created_on)
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </>
        )}

        {!isLoading && flatRows.some((r) => r.blockers.length > 0) && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <IconAlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            Rows with blockers still need a required document before they can be filed.
          </p>
        )}
      </VsoPageContainer>

      {/* Bulk "Request evidence" composer -- prefilled per veteran from
          their own checklist, not one form letter blasted at everyone
          selected (feedback: a shared generic ask isn't honest about what
          the tool actually knows is missing, case by case). Same prefill-
          then-review principle CaseConversation's setDraft/focus handle
          follows for the single-case button: every message is editable, and
          nothing sends until the VSO presses Send. */}
      <Dialog
        open={bulkComposerOpen}
        onOpenChange={(open) => {
          setBulkComposerOpen(open);
          if (!open) bulkRequestEvidence.reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request evidence from {selectedRows.length} veterans</DialogTitle>
            <DialogDescription>
              Each veteran gets their own message below, prefilled from what their checklist
              actually shows missing. Review and adjust any of them before sending.
            </DialogDescription>
          </DialogHeader>
          {bulkPrefillQuery.isLoading ? (
            <LoadingSkeleton label="Loading each veteran's specific request" className="h-40" />
          ) : (
            <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
              {selectedRows.map((row) => (
                <div key={row.claim_id} className="flex flex-col gap-1">
                  <label
                    htmlFor={`bulk-request-${row.claim_id}`}
                    className="flex items-center gap-1.5 text-xs font-medium text-text-primary"
                  >
                    <VeteranAvatar name={row.veteran_name} />
                    {row.veteran_name}
                  </label>
                  <Textarea
                    id={`bulk-request-${row.claim_id}`}
                    value={bulkText(row.claim_id)}
                    onChange={(e) =>
                      setBulkRequestTexts((prev) => ({ ...prev, [row.claim_id]: e.target.value }))
                    }
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          {bulkRequestEvidence.isError && (
            <div className="flex items-center gap-2" role="alert">
              <StatusTag variant="danger" label="Send failed" />
              <span className="text-xs text-text-secondary">Something went wrong -- try again.</span>
            </div>
          )}
          <DialogFooter>
            <AccentButton
              type="button"
              disabled={bulkRequestEvidence.isPending || bulkPrefillQuery.isLoading || !allBulkTextsFilled}
              onClick={() => bulkRequestEvidence.mutate()}
            >
              {bulkRequestEvidence.isPending ? "Sending…" : `Send ${selectedRows.length} messages`}
            </AccentButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export default function VsoInboxPage() {
  return (
    <Suspense fallback={null}>
      <VsoInboxPageContent />
    </Suspense>
  );
}
