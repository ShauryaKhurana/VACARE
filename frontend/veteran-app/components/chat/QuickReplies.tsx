"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tappable answers for a question that has a fixed set of choices.
 *
 * Without these the backend's choice-based steps were unanswerable in the app:
 * the records step, for instance, tells the veteran to "tap Done uploading",
 * and there was no button to tap -- only a chat box that rejected anything
 * except those exact words. A veteran could upload forever and never move on.
 *
 * Disabled after a choice is made so a slow round-trip cannot double-send.
 */
export function QuickReplies({
  options,
  onSelect,
}: {
  options: string[];
  onSelect: (option: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={chosen !== null}
          onClick={() => {
            setChosen(option);
            onSelect(option);
          }}
          className={cn(
            "rounded-control border px-4 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            chosen === option
              ? "border-accent bg-accent-tint text-text-primary"
              : "border-border bg-surface text-text-primary hover:bg-accent-tint/40",
            chosen !== null && chosen !== option && "opacity-50",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
