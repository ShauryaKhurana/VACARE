"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { Toggle } from "@/components/shared/Toggle";
import { Button } from "@/components/ui/button";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";

const CHANNEL_COPY = {
  push: { label: "Push notifications", description: "Alerts on this device" },
  sms: { label: "Text messages", description: "SMS to your phone number" },
  email: { label: "Email", description: "Sent to your email address" },
} as const;

export default function NotificationsPage() {
  const channels = useAccessibilityStore((s) => s.notificationChannels);
  const toggle = useAccessibilityStore((s) => s.toggleNotificationChannel);
  const [permissionRequested, setPermissionRequested] = useState(false);

  async function requestPushPermission() {
    setPermissionRequested(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-6">
        <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
          <IconArrowLeft size={16} aria-hidden="true" />
          Back to You
        </Link>

        <h1 className="text-xl font-medium text-text-primary">Notifications</h1>
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

        {channels.push && (
          <div className="rounded-card border border-border bg-accent-tint/40 p-4 text-sm text-text-primary">
            <p>
              On an iPhone, push only works once this app is added to your Home Screen (see the
              banner at the top of the app, or your browser&apos;s share menu).
            </p>
            {!permissionRequested && (
              <Button variant="outline" className="mt-3 rounded-control" onClick={requestPushPermission}>
                Enable notifications
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
