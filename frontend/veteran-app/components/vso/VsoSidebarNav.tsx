"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useCaseloadSummary } from "@/components/vso/useCaseloadSummary";
import { CASELOAD_ROOT, SIDEBAR_CATEGORIES, type SidebarCategory } from "@/components/vso/sidebarCategories";
import { toggleSelection } from "@/components/vso/vsoDisplay";
import { cn } from "@/lib/utils";

/**
 * The VSO sidebar's categorized caseload nav (plan ask: "work the same way
 * SonarQube does -- categorized, expandable navigation with counts").
 *
 * Translation being made here, deliberately: SonarQube's *structure*
 * (categorized -> drill into a prioritized, worst-first list) transfers
 * cleanly to a caseload -- a VSO scanning this rail is doing the same thing
 * a developer scanning SonarQube's issue categories is, triaging toward
 * whatever's most pressing. SonarQube's *vocabulary* does NOT transfer: an
 * A-F letter grade (or any single composite score) implies a caseload can
 * be graded the way code quality can, and it can't -- there's no "correct"
 * state for a caseload to converge toward, just cases at different points
 * in an inherently open-ended process. So every category/count below is
 * built only from signals the inbox table (app/(vso)/vso/page.tsx) already
 * computes per row -- triage lane, deadline urgency, unread activity,
 * recency -- never a new invented score. See computeCaseloadOverview and
 * SYSTEM_VIEWS (components/vso/caseload.ts) for exactly which signals.
 *
 * Rendered twice: inside the desktop rail's `<aside>` (app/(vso)/layout.tsx)
 * and inside the mobile nav drawer's Sheet -- same component both places,
 * `onNavigate` is how the drawer closes itself after a tap picks a category.
 * Every link is a `/vso?view=<id>` URL (not local state), so it works
 * identically from either render site or a fresh tab: app/(vso)/vso/page.tsx
 * reads `?view=` on mount/change and applies the matching SystemView's
 * filters, the same "apply a named filter combination" mechanism a saved
 * preset already used before this feature existed -- this reuses that
 * mechanism (`findSystemView` + the page's `applyFilters`) rather than
 * building a second, parallel one.
 */
export function VsoSidebarNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { overview, viewCounts, isLoading } = useCaseloadSummary();

  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        [CASELOAD_ROOT, ...SIDEBAR_CATEGORIES].filter((c) => c.defaultExpanded).map((c) => c.id),
      ),
  );

  // No `?view=` param reads as "All cases" -- the same default the inbox
  // page itself starts from (laneFilter "all", every other control at its
  // default), so a plain `/vso` visit highlights the same category a fresh
  // page load's filter state actually matches.
  const activeViewId = pathname === "/vso" ? (searchParams.get("view") ?? "all_cases") : null;

  function toggleExpanded(id: string) {
    setExpanded((prev) => toggleSelection(prev, id));
  }

  return (
    <nav aria-label="Caseload categories" className={cn("flex flex-col gap-4", className)}>
      {/* Overview -- three numbers, not a nav destination of its own (plan:
          "doesn't dominate the rail"). Renders zeroes rather than a skeleton
          while loading; a stats strip flashing empty->populated reads better
          here than a shimmer block this small. */}
      <div className="grid grid-cols-3 gap-2 px-3" aria-label="Caseload overview">
        <OverviewStat label="Active" value={overview.activeCount} loading={isLoading} />
        <OverviewStat label="Urgent" value={overview.urgentDeadlineCount} loading={isLoading} />
        <OverviewStat label="Unread" value={overview.unreadCount} loading={isLoading} />
      </div>

      {/* "Caseload" is the one top-level destination: clicking its label
          opens /vso?view=all_cases (what a standalone "All cases" row used
          to do), and its own chevron expands/collapses every other category
          nested underneath it -- one parent instead of "Caseload" and "All
          cases" existing as two separate, confusingly overlapping top-level
          concepts. */}
      <ul className="flex flex-col gap-0.5 px-3">
        <CategoryRow
          category={CASELOAD_ROOT}
          activeViewId={activeViewId}
          viewCounts={viewCounts}
          expanded={expanded}
          onToggleExpand={toggleExpanded}
          onNavigate={onNavigate}
          hasNestedContent
        >
          {expanded.has(CASELOAD_ROOT.id) && (
            <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border pl-3">
              {SIDEBAR_CATEGORIES.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  activeViewId={activeViewId}
                  viewCounts={viewCounts}
                  expanded={expanded}
                  onToggleExpand={toggleExpanded}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
        </CategoryRow>
      </ul>
    </nav>
  );
}

/**
 * One sidebar row -- a link (navigates to its system view) plus, if it has
 * `subItems`, its own expand/collapse chevron. Used for both CASELOAD_ROOT
 * (whose `children` prop is the nested category list) and each regular
 * category (whose own `subItems`, e.g. Deadlines approaching's Urgent/Soon,
 * render one level deeper via the exact same subItems block) -- one
 * implementation for what would otherwise be two near-identical copies of
 * this row at different nesting depths.
 */
function CategoryRow({
  category,
  activeViewId,
  viewCounts,
  expanded,
  onToggleExpand,
  onNavigate,
  hasNestedContent = false,
  children,
}: {
  category: SidebarCategory;
  activeViewId: string | null;
  viewCounts: Record<string, number>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onNavigate?: () => void;
  /** True for CASELOAD_ROOT (which always has a nested category list to
   * show once expanded), false for every regular category. Deliberately
   * NOT derived from `!!children`: the caller only passes `children` when
   * `expanded` already contains this id, so while collapsed `children` is
   * `false` (not `undefined`) -- checking its truthiness made the chevron
   * that reopens a collapsed root disappear the moment it collapsed. */
  hasNestedContent?: boolean;
  children?: React.ReactNode;
}) {
  const isActive = activeViewId === category.id;
  const isExpanded = expanded.has(category.id);
  const count = viewCounts[category.id] ?? 0;
  const Icon = category.icon;
  const expandable = !!category.subItems || hasNestedContent;

  return (
    <li>
      <div className="flex items-center gap-0.5">
        <Link
          href={`/vso?view=${category.id}`}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-2.5 py-2 text-base text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            isActive
              ? "bg-accent-tint font-medium text-accent"
              : "hover:bg-background hover:text-text-primary",
          )}
        >
          <Icon size={19} stroke={isActive ? 2.25 : 1.75} className="shrink-0" aria-hidden="true" />
          {/* Wraps rather than truncating with an ellipsis -- a fixed rail
              width can never reliably fit every label at every zoom level,
              and the app's own text-scale accessibility control goes up to
              175%, so "make it wide enough" can't be a permanent fix the
              way "let it wrap" is. */}
          <span className="min-w-0 flex-1">{category.label}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium",
              isActive ? "bg-accent text-white" : "bg-background text-text-secondary",
            )}
          >
            {count}
          </span>
        </Link>
        {expandable && (
          <button
            type="button"
            onClick={() => onToggleExpand(category.id)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${category.label}` : `Expand ${category.label}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-background hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isExpanded ? (
              <IconChevronDown size={15} aria-hidden="true" />
            ) : (
              <IconChevronRight size={15} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {children}

      {category.subItems && isExpanded && (
        <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border pl-3">
          {category.subItems.map((subItem) => {
            const subActive = activeViewId === subItem.id;
            return (
              <li key={subItem.id}>
                <Link
                  href={`/vso?view=${subItem.id}`}
                  onClick={onNavigate}
                  aria-current={subActive ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    subActive ? "font-medium text-accent" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <span className="min-w-0">{subItem.label}</span>
                  <span className="text-xs text-text-secondary">{viewCounts[subItem.id] ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** One Overview number -- a label over a value, small enough that three fit
 * across a 288px-wide rail (`w-72` on the desktop `<aside>`) without
 * wrapping. */
function OverviewStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-control bg-background px-1 py-2 text-center">
      <span className="text-base font-semibold text-text-primary">{loading ? "—" : value}</span>
      <span className="text-[10px] tracking-wide text-text-secondary uppercase">{label}</span>
    </div>
  );
}
