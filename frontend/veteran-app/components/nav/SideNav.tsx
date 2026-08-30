"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_TABS } from "@/components/nav/navTabs";
import { useSessionStore } from "@/lib/store/sessionStore";
import { Logo } from "@/components/shared/Logo";

/**
 * Desktop-only counterpart to BottomNav (md:hidden there, hidden below md
 * here): a persistent left rail rather than a thin top strip, so the
 * desktop layout has real structural presence instead of a mobile column
 * floating in empty space (same idea as Slack/WhatsApp Web's sidebar).
 */
export function SideNav() {
  const pathname = usePathname();
  const hasEverSubmitted = useSessionStore((s) => s.hasEverSubmitted);
  const tabs = NAV_TABS.filter((tab) => !tab.requiresSubmission || hasEverSubmitted);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {/* "My claim" is only a real destination once hasEverSubmitted (same
          gate the tabs below respect) -- this used to hardcode /claim,
          letting the logo route a pre-submission veteran to a page that
          isn't in their nav at all. */}
      <Link
        href={hasEverSubmitted ? "/claim" : "/talk"}
        className="flex items-center px-6 py-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Logo />
      </Link>

      <div className="mx-6 border-t border-border" />

      <nav aria-label="Primary" className="flex flex-col gap-1 px-3 py-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-control px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-accent-tint font-medium text-accent"
                  : "text-text-secondary hover:bg-background",
              )}
            >
              <Icon size={21} stroke={active ? 2.25 : 1.75} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
