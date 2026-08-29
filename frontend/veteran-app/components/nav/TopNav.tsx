"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconShieldCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { NAV_TABS } from "@/components/nav/navTabs";

/**
 * Desktop-only counterpart to BottomNav (md:hidden there, hidden below md
 * here) -- keeps nav chrome aligned with PageContainer's widened desktop
 * column instead of a mobile tab bar stretched edge-to-edge on a wide screen.
 */
export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-8 py-3 lg:px-12">
        <Link href="/claim" className="flex items-center gap-2 text-text-primary">
          <IconShieldCheck size={22} className="text-accent" aria-hidden="true" />
          <span className="text-sm font-medium">Veteran App</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-6">
          {NAV_TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-sm",
                  active ? "font-medium text-accent" : "text-text-secondary",
                )}
              >
                <Icon size={18} stroke={active ? 2.25 : 1.75} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
