import Link from "next/link";
import { AccentButton } from "@/components/shared/AccentButton";
import { CLAIM_TO_DECISION_FIXTURE_KEY } from "@/components/dev/FixtureSwitcher";

export function ResolvedBanner({ fixtureOverride }: { fixtureOverride?: string | null }) {
  // The claim and decision dev-preview switchers use different key
  // namespaces for the same three resolved routing ids -- without this
  // translation, this link drops the override and falls back to the real
  // (non-resolved, no `decision` field) session claim, which renders blank.
  const decisionFixtureKey = fixtureOverride
    ? CLAIM_TO_DECISION_FIXTURE_KEY[fixtureOverride]
    : undefined;
  const href = decisionFixtureKey
    ? `/claim/decision?fixture=${decisionFixtureKey}`
    : "/claim/decision";

  return (
    <div className="rounded-card border border-accent/30 bg-accent-tint/50 p-4">
      <h2 className="text-lg font-medium text-text-primary">A decision has been made</h2>
      <p className="mt-1 text-sm text-text-secondary">
        We&apos;ve translated what it means, including the math behind your rating.
      </p>
      <Link href={href} className="mt-3 block w-fit">
        <AccentButton type="button">See your decision</AccentButton>
      </Link>
    </div>
  );
}
