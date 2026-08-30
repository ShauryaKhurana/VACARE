"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconDownload } from "@tabler/icons-react";
import { Toggle } from "@/components/shared/Toggle";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";
import { PageContainer } from "@/components/shared/PageContainer";
import { isStandalone, isIos } from "@/components/pwa/InstallPrompt";

const CHANNEL_COPY = {
  sms: { label: "Text messages", description: "SMS to your phone number" },
  email: { label: "Email", description: "Sent to your email address" },
} as const;

export default function NotificationsPage() {
  const channels = useAccessibilityStore((s) => s.notificationChannels);
  const toggle = useAccessibilityStore((s) => s.toggleNotificationChannel);
  const [permissionRequested, setPermissionRequested] = useState(false);

  // Deferred until after mount: matchMedia/navigator are browser-only, so
  // this defaults to "not installed" server-side to match the client's
  // first real render.
  const [installed, setInstalled] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(isStandalone());
    setIosDevice(isIos());
  }, []);

  async function requestPushPermission() {
    setPermissionRequested(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">Notifications</h1>
      <p className="text-sm text-text-secondary">
        Every notification here is informational, never urgent-feeling -- no red badges, no
        &quot;act now&quot; framing.
      </p>

      <div className="rounded-card border border-border bg-surface px-4">
        {(Object.keys(CHANNEL_COPY) as (keyof typeof CHANNEL_COPY)[]).map((key) => (
          <Toggle
            key={key}
            id={`notif-${key}`}
            label={CHANNEL_COPY[key].label}
            description={CHANNEL_COPY[key].description}
            checked={channels[key]}
            onCheckedChange={() => toggle(key)}
          />
        ))}
      </div>

      {/* Push genuinely can't be delivered from a browser tab -- it only
          works once this is installed as an app on your device, so the
          toggle is disabled rather than offering a setting that would
          silently do nothing. */}
      <div className="rounded-card border border-border bg-surface p-4">
        <Toggle
          id="notif-push"
          label="Push notifications"
          description={installed ? "Alerts on this device" : "Only available once this app is installed on your device"}
          checked={installed && channels.push}
          disabled={!installed}
          onCheckedChange={() => toggle("push")}
        />

        {!installed && (
          <div className="mt-3 rounded-card bg-accent-tint/40 p-3 text-sm text-text-primary">
            {iosDevice ? (
              <p>
                Add this app to your Home Screen to turn this on: tap the share icon, then
                &quot;Add to Home Screen.&quot;
              </p>
            ) : (
              <p className="flex items-center gap-1.5">
                <IconDownload size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                Install this app (look for &quot;Install&quot; or &quot;Add to Home Screen&quot; in your
                browser&apos;s menu) to turn this on.
              </p>
            )}
          </div>
        )}

        {installed && channels.push && !permissionRequested && (
          <button
            type="button"
            onClick={requestPushPermission}
            className="mt-3 rounded-control border border-border px-3 py-1.5 text-sm text-text-primary"
          >
            Enable notifications
          </button>
        )}
      </div>
    </PageContainer>
  );
}
