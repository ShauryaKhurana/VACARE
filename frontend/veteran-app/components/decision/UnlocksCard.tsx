import { IconCircleCheck } from "@tabler/icons-react";

/** "What this unlocks" -- decision letters never mention this (HLD Section 4.6). */
export function UnlocksCard({ unlocks }: { unlocks: string[] }) {
  if (unlocks.length === 0) return null;

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h3 className="text-base font-medium text-text-primary">What this unlocks</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {unlocks.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-text-primary">
            <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
