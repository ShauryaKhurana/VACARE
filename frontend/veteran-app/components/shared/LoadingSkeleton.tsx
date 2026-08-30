import { cn } from "@/lib/utils";

/** A single, consistent placeholder for content still loading from the mock API -- same soft pulse and fade-in everywhere instead of each screen re-declaring its own skeleton block. */
export function LoadingSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "h-32 w-full max-w-md animate-in fade-in animate-pulse rounded-card border border-border bg-accent-tint/40 duration-300",
        className,
      )}
      role="status"
      aria-label={label}
    />
  );
}
