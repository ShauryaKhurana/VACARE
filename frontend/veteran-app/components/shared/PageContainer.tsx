import { cn } from "@/lib/utils";

/**
 * Single point of control for the scrollable content column shared by every
 * `(main)` route. Mobile-first at max-w-xl, widening at md/lg so desktop
 * isn't a phone-width strip stranded in a sea of empty background -- the
 * nav chrome (TopNav/BottomNav) widens to match this same scale.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:px-12">
      <div
        className={cn(
          "mx-auto flex max-w-xl flex-col gap-4 pb-6 animate-in fade-in duration-300 md:max-w-2xl lg:max-w-4xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
