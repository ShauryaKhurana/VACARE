"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_TABS } from "@/components/nav/navTabs";
import { useSessionStore } from "@/lib/store/sessionStore";

export function BottomNav() {
  const pathname = usePathname();
  const hasEverSubmitted = useSessionStore((s) => s.hasEverSubmitted);
  const tabs = NAV_TABS.filter((tab) => !tab.requiresSubmission || hasEverSubmitted);

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
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
