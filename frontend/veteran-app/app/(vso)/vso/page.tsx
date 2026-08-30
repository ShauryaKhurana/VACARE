"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconInbox,
  IconMessageCircle2,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { vsoApiClient } from "@/lib/api/vso/client";
import {
  deriveTriageLane,
  hasOpenInfoRequest,
  TRIAGE_LANE_LABELS,
  TRIAGE_LANE_ORDER,
  type TriageLane,
} from "@/lib/api/vso/client";
import { readinessBreakdown, URGENCY_VARIANT } from "@/components/vso/vsoDisplay";
import type { CaseMessageResponse, ClaimStatus, DeadlineResponse } from "@/lib/api/vso/types";
import { VsoPageContainer } from "@/components/vso/VsoPageContainer";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { StatusTag } from "@/components/shared/StatusTag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVsoStore } from "@/lib/store/vsoStore";
import { cn } from "@/lib/utils";

/** One dense inbox row -- the union of everything the queue, checklist,
 * case, and message endpoints would each separately return for one case.
 * Building this client-side (rather than a single backend response) is a
 * direct consequence of plan constraint #1: no single endpoint returns a
 * per-case readiness+lane+deadline+activity view today. */
interface CaseRow {
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

type SortKey = "deadline" | "readiness" | "activity" | "age";

const SORT_LABELS: Record<SortKey, string> = {
  deadline: "Deadline urgency",
  readiness: "Readiness (lowest first)",
  activity: "Last activity",
  age: "Oldest first",
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

/** Fetches the queue, then enriches every row in parallel -- the same shape
 * of work a real integration would do against separate endpoints (queue,
 * checklist, case, messages), just against the mock. Parallelized with
 * Promise.all rather than a loop so 12 mock cases resolve in one round of
 * the client's simulated latency instead of stacking it 12x. */
async function loadCaseRows(lastSeenMessageIds: Record<string, string>): Promise<CaseRow[]> {
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

function sortRows(rows: CaseRow[], sortKey: SortKey): CaseRow[] {
  const copy = [...rows];
  switch (sortKey) {
    case "readiness":
      return copy.sort((a, b) => a.readiness_score - b.readiness_score);
    case "activity":
      return copy.sort((a, b) => {
        const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
        const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
        return bTime - aTime;
      });
    case "age":
      return copy.sort((a, b) => new Date(a.created_on).getTime() - new Date(b.created_on).getTime());
    case "deadline":
    default:
      return copy.sort((a, b) => {
        const aDays = a.soonest_deadline?.days_remaining ?? Infinity;
        const bDays = b.soonest_deadline?.days_remaining ?? Infinity;
        return aDays - bDays;
      });
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * The caseload inbox -- the daily driver (plan Screen 1). Answers "where do
 * the next two hours go?" with triage lanes as the primary grouping rather
 * than a flat table, dense rows built for scanning, and j/k/Enter//
 * keyboard navigation, since this is a throughput tool for a professional,
 * the visual inverse of the roomy veteran app.
 */
export default function VsoInboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const identity = useVsoStore((s) => s.identity);
  const lastSeenMessageIds = useVsoStore((s) => s.lastSeenMessageIds);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["vso-caseload"],
    queryFn: () => loadCaseRows(lastSeenMessageIds),
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all");
  const [onlyBlockers, setOnlyBlockers] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (onlyBlockers && row.blockers.length === 0) return false;
      if (!query) return true;
      return (
        row.veteran_name.toLowerCase().includes(query) ||
        row.claim_id.toLowerCase().includes(query) ||
        row.conditions.toLowerCase().includes(query)
      );
    });
  }, [rows, search, statusFilter, onlyBlockers]);

  /** Rows grouped by triage lane, in the plan's fixed lane order, sorted
   * within each lane by the active sort key -- this is what actually
   * renders, and also defines j/k traversal order (flatRows below). */
  const groupedRows = useMemo(() => {
    const groups = new Map<TriageLane, CaseRow[]>();
    for (const lane of TRIAGE_LANE_ORDER) groups.set(lane, []);
    for (const row of filteredRows) {
      groups.get(row.lane)?.push(row);
    }
    for (const lane of TRIAGE_LANE_ORDER) {
      groups.set(lane, sortRows(groups.get(lane) ?? [], sortKey));
    }
    return groups;
  }, [filteredRows, sortKey]);

  const flatRows = useMemo(
    () => TRIAGE_LANE_ORDER.flatMap((lane) => groupedRows.get(lane) ?? []),
    [groupedRows],
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["vso-caseload"] })}
          >
            <IconRefresh size={16} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
          <div className="relative flex-1 min-w-[220px]">
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

          <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
            <SelectTrigger aria-label="Sort by" className="h-9 text-sm">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as ClaimStatus | "all")}
          >
            <SelectTrigger aria-label="Filter by status" className="h-9 text-sm">
              <SelectValue placeholder="Status" />
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
            <Checkbox checked={onlyBlockers} onCheckedChange={(checked) => setOnlyBlockers(checked === true)} />
            Has blockers only
          </label>
        </div>

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
          // One table, one header row -- the column headers used to repeat
          // in full under every one of the four triage lanes. Lanes are now
          // full-width group rows inside a single TableBody instead of four
          // separate tables, so "Veteran / Case / Conditions / ..." prints
          // exactly once regardless of how many lanes have rows.
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veteran</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TRIAGE_LANE_ORDER.map((lane) => {
                  const laneRows = groupedRows.get(lane) ?? [];
                  return (
                    <Fragment key={lane}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-background py-2">
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
                          <TableCell colSpan={6} className="py-3 text-xs text-text-secondary">
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
                              <TableCell className="font-medium text-text-primary">
                                <span className="flex items-center gap-2">
                                  {row.unread && (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-accent"
                                      aria-label="Unread message"
                                    />
                                  )}
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
                                    {formatDate(row.last_message.created_at)}
                                  </span>
                                ) : (
                                  formatDate(row.created_on)
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
        )}

        {!isLoading && flatRows.some((r) => r.blockers.length > 0) && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <IconAlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            Rows with blockers still need a required document before they can be filed.
          </p>
        )}
      </VsoPageContainer>
    </TooltipProvider>
  );
}
