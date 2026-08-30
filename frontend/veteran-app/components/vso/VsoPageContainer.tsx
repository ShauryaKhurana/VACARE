import { cn } from "@/lib/utils";

/**
 * VSO counterpart to components/shared/PageContainer -- substantially wider
 * (max-w-7xl vs PageContainer's max-w-4xl) and without PageContainer's
 * mobile-first padding scale, since the VSO surface is desktop-first and a
 * caseload dashboard reads as unfinished squeezed into the veteran app's
 * column width (plan: "Design stance: the inverse of the veteran app").
 * Kept as its own component rather than widening PageContainer itself --
 * PageContainer is a shared file another engineer may be touching, and the
 * veteran app's three surfaces still want the narrower, roomier column.
 */
export function VsoPageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 lg:px-10">
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl flex-col gap-4 pb-6 animate-in fade-in duration-300",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
