// The VSO sidebar's category list -- presentation config (icon, expand/
// de-emphasis, sub-item grouping) layered on top of the SYSTEM_VIEWS ids
// components/vso/caseload.ts defines. Kept as a separate file from
// caseload.ts on purpose: caseload.ts is a pure data/filtering module with
// no React component references, and this file exists only to pair each of
// its ids with something to render (same split components/nav/navTabs.ts
// draws between NAV_TABS' icon config and the pure nav-gating logic it
// pairs with).

import type { AriaAttributes, ComponentType } from "react";
import {
  IconAlertTriangle,
  IconClock,
  IconFileCheck,
  IconHistory,
  IconHourglass,
  IconMessageCircle2,
  IconStack2,
} from "@tabler/icons-react";

type NavIcon = ComponentType<{
  size?: number;
  stroke?: number;
  className?: string;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}>;

export interface SidebarSubItem {
  /** Matches a components/vso/caseload.ts SYSTEM_VIEWS id. */
  id: string;
  label: string;
}

export interface SidebarCategory {
  /** Matches a components/vso/caseload.ts SYSTEM_VIEWS id. */
  id: string;
  label: string;
  icon: NavIcon;
  /** CASELOAD_ROOT only -- a VSO opening the tool should see the
   * categorized list immediately, not a single collapsed row. */
  defaultExpanded?: boolean;
  subItems?: SidebarSubItem[];
}

/**
 * The single top-level sidebar destination. It IS the "All cases" system
 * view (clicking it -- not its expand chevron -- opens `/vso?view=all_cases`,
 * exactly what the old standalone "All cases" row used to do), and it's
 * also the expandable parent every other category now nests under, rather
 * than "Caseload" and "All cases" existing as two separate, confusingly
 * overlapping top-level concepts. Defaults expanded: a VSO opening the tool
 * should see the categorized list immediately, not a single collapsed row.
 */
export const CASELOAD_ROOT: SidebarCategory = {
  id: "all_cases",
  label: "Caseload",
  icon: IconStack2,
  defaultExpanded: true,
};

/**
 * Rendered nested one level under CASELOAD_ROOT. Fixed order: "Needs your
 * action" leads (the working queue), the two lane-flat categories that
 * follow it are ordered the same way TRIAGE_LANE_ORDER
 * (lib/api/vso/client.ts) already orders them. See caseload.ts's
 * SYSTEM_VIEWS doc comment for why "Needs your action" has no "Has
 * blockers"/"Ready to review" sub-split despite being scoped as a
 * nice-to-have, and why "With VA" cases don't get their own category here.
 */
export const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  {
    id: "needs_your_action",
    label: "Needs your action",
    icon: IconAlertTriangle,
  },
  {
    id: "deadlines_approaching",
    label: "Deadlines approaching",
    icon: IconClock,
    subItems: [
      { id: "deadlines_urgent", label: "Urgent" },
      { id: "deadlines_soon", label: "Soon" },
    ],
  },
  {
    id: "unread_activity",
    label: "Unread activity",
    icon: IconMessageCircle2,
  },
  {
    id: "recently_assigned",
    label: "Recently assigned",
    icon: IconHistory,
  },
  {
    id: "waiting_on_veteran",
    label: "Waiting on veteran",
    icon: IconHourglass,
  },
  {
    id: "ready_to_file",
    label: "Ready to file",
    icon: IconFileCheck,
  },
];
