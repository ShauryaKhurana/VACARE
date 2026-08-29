import { IconBuildingBank, IconUsers, IconUser } from "@tabler/icons-react";
import type { UpdateEntry, UpdateEntrySource } from "@/lib/api/types";

const SOURCE_CONFIG: Record<UpdateEntrySource, { label: string; icon: typeof IconUser }> = {
  va: { label: "VA", icon: IconBuildingBank },
  vso: { label: "Your VSO", icon: IconUsers },
  veteran: { label: "You", icon: IconUser },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * A single chronological thread combining VA correspondence, VSO messages,
 * and the veteran's own items -- the two-way relay made visible (HLD
 * Section 4.5), closing the "letters go to the veteran only" gap.
 */
export function UpdatesFeed({ updates }: { updates: UpdateEntry[] }) {
  if (updates.length === 0) {
    return <p className="text-sm text-text-secondary">No updates yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {updates
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((entry) => {
          const { label, icon: Icon } = SOURCE_CONFIG[entry.source];
          return (
            <li key={entry.id} className="flex gap-3">
              <Icon size={18} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true" />
              <div>
                <p className="text-sm text-text-primary">{entry.text}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {label} · {formatTimestamp(entry.timestamp)}
                </p>
              </div>
            </li>
          );
        })}
    </ul>
  );
}
