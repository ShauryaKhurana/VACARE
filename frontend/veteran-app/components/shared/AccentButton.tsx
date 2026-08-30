import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * The primary-action button. This, ComputedTag, and StatusTag are the only
 * components allowed to reference the accent/computed/success/warning/danger
 * tokens (Visual Design Plan Section 4) -- every other component should use
 * Button's outline/secondary/ghost variants, or these three, rather than
 * reaching for a semantic color directly.
 */
export function AccentButton({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={cn("rounded-control h-11 px-5 text-base font-medium", className)}
      {...props}
    />
  );
}
