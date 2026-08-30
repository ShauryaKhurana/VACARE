import Link from "next/link";
import { IconPhone, IconMessage, IconMail, IconBadge } from "@tabler/icons-react";
import type { VsoInfo } from "@/lib/api/types";

const CONTACT_ICON = { phone: IconPhone, message: IconMessage, email: IconMail } as const;

/** "In-app message" routes to Talk, where the app relays a message to the VSO on the veteran's behalf -- that's what this app's contact model actually does with it, not a separate messaging screen. */
function contactHref(method: VsoInfo["contactMethods"][number]): string {
  switch (method.type) {
    case "phone":
      return `tel:${method.value.replace(/[^\d+]/g, "")}`;
    case "email":
      return `mailto:${method.value}`;
    case "message":
      return "/talk";
  }
}

/**
 * The VSO's name, credentials, and contact path are visible and reachable
 * at all times (HLD Section 2, "Never block the path to a human") -- reused
 * on the onboarding Connect screen, Help, and the You tab. Each contact
 * method is a real, tappable action (call/email/message), not just text to
 * copy by hand.
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
      <ul className="mt-3 flex flex-col gap-1">
        {vso.contactMethods.map((method) => {
          const Icon = CONTACT_ICON[method.type];
          const href = contactHref(method);
          const className =
            "-mx-2 flex items-center gap-2 rounded-control px-2 py-1.5 text-sm text-text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
          return (
            <li key={method.type}>
              {method.type === "message" ? (
                <Link href={href} className={className}>
                  <Icon size={16} className="text-text-secondary" aria-hidden="true" />
                  {method.value}
                </Link>
              ) : (
                <a href={href} className={className}>
                  <Icon size={16} className="text-text-secondary" aria-hidden="true" />
                  {method.value}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
