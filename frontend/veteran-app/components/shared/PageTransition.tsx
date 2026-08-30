"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Fades and slides new content in whenever its key changes -- defaults to
 * the route pathname, so navigating between pages (Talk/My claim/You, or
 * onboarding step routes) feels like one continuous surface instead of a
 * hard cut. Nav chrome lives outside this wrapper in each layout, so it
 * never re-animates on its own. Pass an explicit `transitionKey` for a
 * multi-step screen (Welcome's cards, Connect/Sign-in's local step
 * machine) that swaps content without a real navigation.
 */
export function PageTransition({
  children,
  transitionKey,
  className,
}: {
  children: React.ReactNode;
  transitionKey?: string;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div
      key={transitionKey ?? pathname}
      className={cn("animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out", className)}
    >
      {children}
    </div>
  );
}
