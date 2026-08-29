"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconShieldCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { NAV_TABS } from "@/components/nav/navTabs";

/**
 * Desktop-only counterpart to BottomNav (md:hidden there, hidden below md
 * here): a persistent left rail rather than a thin top strip, so the
 * desktop layout has real structural presence instead of a mobile column
 * floating in empty space (same idea as Slack/WhatsApp Web's sidebar).
 */
export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/claim" className="flex items-center gap-2 px-6 py-6 text-text-primary">
        <IconShieldCheck size={22} className="text-accent" aria-hidden="true" />
        <span className="text-sm font-medium">Veteran App</span>
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-1 px-3">
        {NAV_TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm",
                active
                  ? "bg-accent-tint font-medium text-accent"
                  : "text-text-secondary hover:bg-background",
              )}
            >
              <Icon size={19} stroke={active ? 2.25 : 1.75} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
