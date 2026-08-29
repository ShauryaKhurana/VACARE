import { cn } from "@/lib/utils";

export function MessageBubble({
  role,
  text,
}: {
  role: "ai" | "veteran";
  text: string;
}) {
  const isAi = role === "ai";
  return (
    <div className={cn("flex", isAi ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-card px-4 py-3 text-base",
          isAi
            ? "bg-surface border border-border text-text-primary"
            : "bg-accent-tint text-text-primary",
        )}
        role="log"
        aria-label={isAi ? "Assistant message" : "Your message"}
      >
        {text}
      </div>
    </div>
  );
}
