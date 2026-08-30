import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TEXT_SCALE_MIN = 85;
export const TEXT_SCALE_MAX = 175;
export const TEXT_SCALE_STEP = 5;
export const TEXT_SCALE_DEFAULT = 100;

export type NotificationChannel = "push" | "sms" | "email";

/**
 * Accessibility and notification preferences, persisted to localStorage.
 * These live in one store because Wireframe 10 presents them as a single
 * "Accessibility + Notification" screen -- splitting the store would just
 * add an extra file with no behavioral benefit.
 */
interface AccessibilityState {
  /** Percent of base body font size (85-175), a slider rather than a few
   *  fixed steps so the effect is actually visible across the range. */
  textScale: number;
  highContrast: boolean;
  voiceInputDefault: boolean;
  notificationChannels: Record<NotificationChannel, boolean>;
  setTextScale: (scale: number) => void;
  setHighContrast: (enabled: boolean) => void;
  setVoiceInputDefault: (enabled: boolean) => void;
  toggleNotificationChannel: (channel: NotificationChannel) => void;
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      textScale: TEXT_SCALE_DEFAULT,
      highContrast: false,
      voiceInputDefault: false,
      notificationChannels: { push: true, sms: true, email: true },
      setTextScale: (scale) => set({ textScale: scale }),
      setHighContrast: (enabled) => set({ highContrast: enabled }),
      setVoiceInputDefault: (enabled) => set({ voiceInputDefault: enabled }),
      toggleNotificationChannel: (channel) =>
        set((state) => ({
          notificationChannels: {
            ...state.notificationChannels,
            [channel]: !state.notificationChannels[channel],
          },
        })),
    }),
    { name: "veteran-app-accessibility" },
  ),
);
