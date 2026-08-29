import Link from "next/link";
import { AccentButton } from "@/components/shared/AccentButton";

export function ResolvedBanner() {
  return (
    <div className="rounded-card border border-accent/30 bg-accent-tint/50 p-4">
      <h2 className="text-lg font-medium text-text-primary">A decision has been made</h2>
      <p className="mt-1 text-sm text-text-secondary">
        We&apos;ve translated what it means, including the math behind your rating.
      </p>
      <Link href="/claim/decision" className="mt-3 block w-fit">
        <AccentButton type="button">See your decision</AccentButton>
      </Link>
    </div>
  );
}
