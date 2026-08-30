import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The signed-in accredited rep's identity, as collected by the simulated
 * /vso/signin form -- mirrors VsoInfo's shape (lib/api/types.ts) since it's
 * the same real-world fact (name, org, accreditation id) from the other
 * side of the relationship. */
export interface VsoIdentity {
  name: string;
  organization: string;
  accreditationId: string;
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
  signIn: (identity: VsoIdentity) => void;
  signOut: () => void;
  markCaseSeen: (caseId: string, messageId: string) => void;
}

export const useVsoStore = create<VsoState>()(
  persist(
    (set) => ({
      identity: null,
      lastSeenMessageIds: {},
      signIn: (identity) => set({ identity }),
      signOut: () => set({ identity: null, lastSeenMessageIds: {} }),
      markCaseSeen: (caseId, messageId) =>
        set((state) => ({
          lastSeenMessageIds: { ...state.lastSeenMessageIds, [caseId]: messageId },
        })),
    }),
    { name: "vacare-vso" },
  ),
);
