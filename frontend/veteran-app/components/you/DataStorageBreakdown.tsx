import { IconFingerprint, IconFileText, IconMessageCircle2 } from "@tabler/icons-react";
import { StatusTag } from "@/components/shared/StatusTag";

export const DATA_STORAGE_CATEGORIES = [
  {
    title: "How we recognize you",
    icon: IconFingerprint,
    tag: "Stored" as const,
    variant: "success" as const,
    detail:
      "A routing identifier that connects your conversation to your VSO -- not your name, SSN, or file number.",
  },
  {
    title: "Your medical & service history",
    icon: IconFileText,
    tag: "Not stored" as const,
    variant: "pending" as const,
    detail:
      "Those go to your VSO and VA -- the systems already authorized to hold them. We don't keep a copy, and photo metadata (location, device ID, timestamp) is stripped before anything is uploaded.",
  },
  {
    title: "Your conversation with us",
    icon: IconMessageCircle2,
    tag: "Stored" as const,
    variant: "success" as const,
    detail:
      "So you can pick up where you left off, along with your notification and accessibility preferences.",
  },
];

/**
 * Shared by the You page (shown up front, not hidden behind a link -- a
 * veteran should see exactly what's held without an extra tap) and
 * /you/what-we-store (a direct-linkable, standalone version of the same
 * breakdown). One grouped card with internal dividers -- like a settings
 * list, not three separately-boxed cards -- with a profile-field feel (icon,
 * plain-language label, short answer) rather than a database table, even
 * though the underlying content (what's stored, what isn't) is unchanged.
 * `conversationAction` lets the You page attach a targeted "clear just
 * this" control to the one category that's actually actionable (the
 * routing id isn't something a veteran edits or clears on its own).
 */
export function DataStorageBreakdown({
  conversationAction,
}: {
  conversationAction?: React.ReactNode;
}) {
  return (
    <div className="divide-y divide-border rounded-card border border-border bg-surface">
      {DATA_STORAGE_CATEGORIES.map((category) => {
        const Icon = category.icon;
        return (
          <div key={category.title} className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
              <Icon size={20} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-medium text-text-primary">{category.title}</h2>
                <StatusTag variant={category.variant} label={category.tag} />
              </div>
              <p className="mt-1 text-sm text-text-secondary">{category.detail}</p>
              {category.title === "Your conversation with us" && conversationAction}
            </div>
          </div>
        );
      })}
    </div>
  );
}
