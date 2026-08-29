import { IconPhone, IconMessage, IconMail, IconBadge } from "@tabler/icons-react";
import type { VsoInfo } from "@/lib/api/types";

const CONTACT_ICON = { phone: IconPhone, message: IconMessage, email: IconMail } as const;

/**
 * The VSO's name, credentials, and contact path are visible and reachable
 * at all times (HLD Section 2, "Never block the path to a human") -- reused
 * on the onboarding Connect screen and the You tab.
 */
export function VsoCard({ vso }: { vso: VsoInfo }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
          <IconBadge size={22} aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-medium text-text-primary">{vso.name}</p>
          <p className="text-sm text-text-secondary">{vso.organization}</p>
          <p className="text-xs text-text-secondary">Accredited rep · {vso.accreditationId}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {vso.contactMethods.map((method) => {
          const Icon = CONTACT_ICON[method.type];
          return (
            <li key={method.type} className="flex items-center gap-2 text-sm text-text-primary">
              <Icon size={16} className="text-text-secondary" aria-hidden="true" />
              {method.value}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
