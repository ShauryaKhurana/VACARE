import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

/** Meant to sit inside a `divide-y` grouped list (You page), not stand alone -- no border/rounding of its own. */
export function SettingsRow({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description?: string;
  icon: Icon;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4">
      <Icon size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-base font-medium text-text-primary">{label}</p>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>
      <IconChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
    </Link>
  );
}
