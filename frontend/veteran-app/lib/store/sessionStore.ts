import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Session identity, persisted to localStorage. Per the requirements doc's
 * privacy posture (Section 4.5), this store must never hold a name, SSN,
 * file number, or document content -- only a routing identifier. Anything
 * that displays a veteran's name comes from the current API response, not
 * from anything cached here.
 */
interface SessionState {
  routingId: string | null;
  onboardingComplete: boolean;
  /**
   * True once the veteran has sent their first real message in Talk. Drives
   * whether the persistent nav chrome (SideNav/BottomNav) is shown -- per
   * the Frontend HLD Section 3, the three-tab nav is a surface that appears
   * "after first run," not before the veteran has actually started talking.
   */
  conversationStarted: boolean;
  startSession: () => void;
  completeOnboarding: () => void;
  markConversationStarted: () => void;
  clearSession: () => void;
}

function generateRoutingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `route-${crypto.randomUUID()}`;
  }
  return `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      routingId: null,
      onboardingComplete: false,
      conversationStarted: false,
      startSession: () =>
        set((state) => ({
          routingId: state.routingId ?? generateRoutingId(),
        })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      markConversationStarted: () => set({ conversationStarted: true }),
      clearSession: () =>
        set({ routingId: null, onboardingComplete: false, conversationStarted: false }),
    }),
    { name: "veteran-app-session" },
  ),
);
