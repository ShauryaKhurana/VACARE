import { IconShieldCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * `role` widened to include `"vso"` (plan: async-percolating-dewdrop, "open
 * the Talk channel to the VSO") -- a precedent the union already has in
 * `UpdateEntry.source` (`"va" | "vso" | "veteran"`). Additive: every
 * existing call site passes `role="ai"` or `role="veteran"` and renders
 * exactly as before; `authorName` is new and optional, used only by the
 * `"vso"` branch.
 */
export function MessageBubble({
  role,
  text,
  authorName,
}: {
  role: "ai" | "veteran" | "vso";
  text: string;
  authorName?: string;
}) {
  const isVeteran = role === "veteran";
  const isVso = role === "vso";
  return (
    <div className={cn("flex flex-col gap-1", isVeteran ? "items-end" : "items-start")}>
      {isVso && (
        <span className="flex items-center gap-1 px-1 text-xs font-medium text-accent">
          <IconShieldCheck size={13} aria-hidden="true" />
          {authorName ?? "Your VSO"}
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-card px-4 py-3 text-base",
          isVeteran
            ? "bg-accent-tint text-text-primary"
            : isVso
              ? "border border-accent/30 bg-surface text-text-primary"
              : "bg-surface border border-border text-text-primary",
        )}
        role="log"
        aria-label={
          isVeteran ? "Your message" : isVso ? `Message from ${authorName ?? "your VSO"}` : "Assistant message"
        }
      >
        {text}
      </div>
    </div>
  );
}
