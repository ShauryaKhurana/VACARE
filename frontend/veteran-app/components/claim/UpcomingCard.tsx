import { IconCalendarEvent } from "@tabler/icons-react";
import type { UpcomingItem } from "@/lib/api/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

/** Suspense-date countdowns shown with enough lead time to matter, never as a last-minute alarm. */
export function UpcomingCard({ item }: { item: UpcomingItem }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
      <IconCalendarEvent size={20} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-text-primary">{item.title}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{item.detail}</p>
        <p className="mt-1 text-xs text-text-secondary">Around {formatDate(item.date)}</p>
      </div>
    </div>
  );
}
