import { IconRotateClockwise2 } from "@tabler/icons-react";

/**
 * Closing mid-conversation is a normal, supported action (HLD Section 4.2) --
 * this just confirms, calmly, that nothing was lost.
 */
export function ResumeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-card border border-border bg-accent-tint/40 px-4 py-3 text-sm text-text-primary"
      role="status"
    >
      <span className="flex items-center gap-2">
        <IconRotateClockwise2 size={16} className="text-accent" aria-hidden="true" />
        Welcome back -- picking up right where you left off.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-secondary underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
