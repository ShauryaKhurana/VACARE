import { PageTransition } from "@/components/shared/PageTransition";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      <PageTransition className="flex min-h-0 flex-1 flex-col">{children}</PageTransition>
    </div>
  );
}
