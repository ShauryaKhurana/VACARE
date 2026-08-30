import { cn } from "@/lib/utils";

/** A single, consistent loading spinner -- reused anywhere something is mid-flight (simulated sign-in, matching a VSO) instead of each screen rolling its own. */
export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "h-10 w-10 animate-in fade-in animate-spin rounded-full border-2 border-border border-t-accent duration-300",
        className,
      )}
      role="status"
      aria-label={label}
    />
  );
}
