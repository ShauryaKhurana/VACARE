import Link from "next/link";
import { AccentButton } from "@/components/shared/AccentButton";

const OPTIONS = [
  { name: "Supplemental claim", detail: "Add new or relevant evidence and have VA re-decide." },
  { name: "Higher-level review", detail: "A senior reviewer re-reads the existing record -- no new evidence." },
  { name: "Board appeal", detail: "Take your case to a Veterans Law Judge." },
];

/**
 * States that options exist; never recommends one -- that's the VSO's
 * judgment call, not the app's (requirements Section 4.4, HLD Section 4.6).
 */
export function OptionsCard({ vsoContactHref = "/you/vso-contact" }: { vsoContactHref?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h3 className="text-lg font-medium text-text-primary">If you want to look at your options</h3>
      <p className="mt-1 text-sm text-text-secondary">
        You have about a year from this decision to protect your back-pay date if you choose to
        pursue one of these. Your VSO can walk through what fits your situation -- we don&apos;t
        recommend one over another.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <li key={opt.name} className="text-sm">
            <span className="font-medium text-text-primary">{opt.name}</span>
            <span className="text-text-secondary"> -- {opt.detail}</span>
          </li>
        ))}
      </ul>
      <Link href={vsoContactHref} className="mt-4 block w-fit">
        <AccentButton type="button">Talk to your VSO about your options</AccentButton>
      </Link>
    </div>
  );
}
