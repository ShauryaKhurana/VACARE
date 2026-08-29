import { IconShieldCheck } from "@tabler/icons-react";

/**
 * Closing mid-conversation is a normal, supported action (HLD Section 4.2).
 * A returning veteran -- possibly days or weeks later, from a QR code or a
 * VSO's text -- needs the goal restated plainly, not just a thin "resumed"
 * strip that assumes they remember what this app is.
 */
export function ResumeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="rounded-card border border-accent/30 bg-accent-tint/40 p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
          <IconShieldCheck size={18} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-medium text-text-primary">Welcome back</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            You&apos;re getting your VA claim ready to send to a free, accredited VSO. Pick up
            right where you left off below.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss welcome back message"
          className="shrink-0 rounded-control px-2 py-1 text-xs text-text-secondary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
