"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMessageCircle2, IconClipboardList, IconUser } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/talk", label: "Talk", icon: IconMessageCircle2 },
  { href: "/claim", label: "My claim", icon: IconClipboardList },
  { href: "/you", label: "You", icon: IconUser },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs",
              active ? "font-medium text-accent" : "text-text-secondary",
            )}
          >
            <Icon size={22} stroke={active ? 2.25 : 1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
