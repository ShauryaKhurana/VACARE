import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TextSize = "default" | "large";

export type NotificationChannel = "push" | "sms" | "email";

/**
 * Accessibility and notification preferences, persisted to localStorage.
 * These live in one store because Wireframe 10 presents them as a single
 * "Accessibility + Notification" screen -- splitting the store would just
 * add an extra file with no behavioral benefit.
 */
interface AccessibilityState {
  textSize: TextSize;
  highContrast: boolean;
  voiceInputDefault: boolean;
  notificationChannels: Record<NotificationChannel, boolean>;
  setTextSize: (size: TextSize) => void;
  setHighContrast: (enabled: boolean) => void;
  setVoiceInputDefault: (enabled: boolean) => void;
  toggleNotificationChannel: (channel: NotificationChannel) => void;
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      textSize: "default",
      highContrast: false,
      voiceInputDefault: false,
      notificationChannels: { push: true, sms: true, email: true },
      setTextSize: (size) => set({ textSize: size }),
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
