import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

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
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-4"
    >
      <Icon size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-base font-medium text-text-primary">{label}</p>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>
      <IconChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
    </Link>
  );
}
