"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconInbox, IconLogout } from "@tabler/icons-react";
import { Logo } from "@/components/shared/Logo";
import { useVsoStore } from "@/lib/store/vsoStore";
import { cn } from "@/lib/utils";

const SIGNIN_PATH = "/vso/signin";

/**
 * The VSO's own desktop-first shell -- deliberately NOT the veteran
 * `(main)` layout (SideNav/BottomNav, mobile-first breakpoints, tab nav
 * gated on onboarding). The VSO is a professional power user at a desk
 * (plan: "Design stance: the inverse of the veteran app"), so this ships a
 * single persistent left rail with no mobile bottom-nav fallback -- there
 * is no small-screen story for a caseload throughput tool in this phase.
 *
 * Scroll containment: root `body` is `h-full overflow-hidden` (see
 * app/layout.tsx's comment). This layout's outermost div is `flex-1
 * min-h-0`, not `h-full`, so it participates in that chain instead of
 * fighting it -- every child scroll region (VsoPageContainer) does the same.
 */
export default function VsoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const identity = useVsoStore((s) => s.identity);
  const signOut = useVsoStore((s) => s.signOut);

  // Same hydration-safe mount gate (main)/layout.tsx uses: the persisted
  // vsoStore only resolves after the client mounts, so the very first
  // render (server + first client paint) must match a "not signed in" view
  // to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isSignInRoute = pathname === SIGNIN_PATH;

  useEffect(() => {
    if (mounted && !isSignInRoute && !identity) {
      router.replace(SIGNIN_PATH);
    }
  }, [mounted, isSignInRoute, identity, router]);

  // Sign-in is the entry point, not a screen inside the tool -- no rail,
  // no identity to show yet.
  if (isSignInRoute) {
    return <div className="flex min-h-0 flex-1 flex-col bg-background">{children}</div>;
  }

  // Not mounted yet, or mounted-but-unauthenticated (redirect effect above
  // is about to fire): render nothing rather than flashing the dashboard.
  if (!mounted || !identity) {
    return <div className="flex min-h-0 flex-1 flex-col bg-background" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-row bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link
          href="/vso"
          className="flex items-center px-6 py-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo />
        </Link>

        <div className="mx-6 border-t border-border" />

        <nav aria-label="Primary" className="flex flex-col gap-1 px-3 py-4">
          <Link
            href="/vso"
            aria-current={pathname === "/vso" ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-control px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              pathname === "/vso"
                ? "bg-accent-tint font-medium text-accent"
                : "text-text-secondary hover:bg-background",
            )}
          >
            <IconInbox size={21} stroke={pathname === "/vso" ? 2.25 : 1.75} aria-hidden="true" />
            Caseload
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border px-6 py-5">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary">{identity.name}</span>
            <span className="text-xs text-text-secondary">{identity.organization}</span>
            <span className="text-xs text-text-secondary">Accreditation #{identity.accreditationId}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              router.push(SIGNIN_PATH);
            }}
            className="flex items-center gap-2 self-start text-sm text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconLogout size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
