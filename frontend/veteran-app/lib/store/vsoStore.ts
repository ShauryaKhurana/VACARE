import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TriageLane } from "@/lib/api/vso/client";
import type { ClaimStatus } from "@/lib/api/vso/types";

/** The signed-in accredited rep's identity, as collected by the simulated
 * /vso/signin form -- mirrors VsoInfo's shape (lib/api/types.ts) since it's
 * the same real-world fact (name, org, accreditation id) from the other
 * side of the relationship. */
export interface VsoIdentity {
  name: string;
  organization: string;
  accreditationId: string;
}

/** The inbox's sort options (app/(vso)/vso/page.tsx) -- lives here, not on
 * the page, so a saved FilterPreset can reference it without the store
 * importing from a page component. "recent" (newest `created_on` first) was
 * added for the sidebar's "Recently assigned" category -- distinct from
 * "age" (oldest first), which already existed for the opposite question. */
export type SortKey = "deadline" | "readiness" | "activity" | "age" | "recent" | "veteran";

/** Narrows the inbox to one deadline-urgency bucket, or "approaching" for
 * the union of "urgent" and "soon" the sidebar's "Deadlines approaching"
 * category (and the Overview strip's count) uses -- cases with no deadline
 * at all, or a deadline that's merely "ok", never match anything but "all".
 * Lives here for the same reason SortKey does: a FilterPreset (and a
 * sidebar SystemView, see components/vso/caseload.ts) references it without
 * either importing from a page component. */
export type DeadlineFilter = "all" | "approaching" | "urgent" | "soon";

/** One named snapshot of the inbox's filter controls -- the four raw
 * controls plus which triage lane a promoted "view" isolates, if any. Plain
 * data, not a function of the current rows -- applying a preset just
 * overwrites the page's local filter state with these values.
 *
 * `laneFilter` is optional so a preset saved before lane-filtering existed
 * (already persisted to a VSO's browser under the old five-field shape)
 * still loads: `applyPreset` treats a missing value as "all", the same
 * default a brand-new preset gets. `deadlineFilter`/`unreadOnly` are
 * optional for the identical reason, one round later -- a preset saved
 * before the sidebar's category filters existed still loads, falling back
 * to "all"/false. */
export interface FilterPreset {
  id: string;
  name: string;
  search: string;
  sortKey: SortKey;
  statusFilter: ClaimStatus | "all";
  onlyBlockers: boolean;
  laneFilter?: TriageLane | "all";
  deadlineFilter?: DeadlineFilter;
  unreadOnly?: boolean;
}

function generatePresetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `preset-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * VSO-side session state, persisted to localStorage. Deliberately a
 * separate store from sessionStore (`veteran-app-session`): that store
 * carries an explicit no-PII invariant (routing id only, never a name) that
 * a signed-in VSO's identity inherently breaks, so reusing it would either
 * violate that invariant or force a confusing dual-purpose shape. Persist
 * key `vacare-vso` is deliberately distinct from `veteran-app-session` and
 * `veteran-app-accessibility` so the three stores never collide in
 * localStorage.
 */
interface VsoState {
  identity: VsoIdentity | null;
  /**
   * caseId -> id of the newest message this VSO has seen in that case's
   * thread. The inbox's unread dot compares this against each case's
   * `latest_message_id` rather than tracking a boolean, so a case that
   * gains two new messages between visits still reads as "has unread,"
   * and re-opening it clears the dot by recording the newest id, not by
   * guessing a timestamp cutoff.
   */
  lastSeenMessageIds: Record<string, string>;
  /** Named filter-combination shortcuts for the inbox (plan: a power-tool
   * convenience, not a synced/shared feature) -- persisted per browser, same
   * as everything else in this store. */
  filterPresets: FilterPreset[];
  signIn: (identity: VsoIdentity) => void;
  signOut: () => void;
  markCaseSeen: (caseId: string, messageId: string) => void;
  /** Appends a new preset capturing the inbox's current search/sort/status/
   * blockers-only state under `name`. Doesn't dedupe by name -- a VSO
   * re-saving "Needs my attention" as a second entry is their call, not this
   * store's to prevent. */
  savePreset: (name: string, filters: Omit<FilterPreset, "id" | "name">) => void;
  deletePreset: (id: string) => void;
}

export const useVsoStore = create<VsoState>()(
  persist(
    (set) => ({
      identity: null,
      lastSeenMessageIds: {},
      filterPresets: [],
      signIn: (identity) => set({ identity }),
      signOut: () => set({ identity: null, lastSeenMessageIds: {} }),
      markCaseSeen: (caseId, messageId) =>
        set((state) => ({
          lastSeenMessageIds: { ...state.lastSeenMessageIds, [caseId]: messageId },
        })),
      savePreset: (name, filters) =>
        set((state) => ({
          filterPresets: [...state.filterPresets, { id: generatePresetId(), name, ...filters }],
        })),
      deletePreset: (id) =>
        set((state) => ({
          filterPresets: state.filterPresets.filter((preset) => preset.id !== id),
        })),
    }),
    { name: "vacare-vso" },
  ),
);
