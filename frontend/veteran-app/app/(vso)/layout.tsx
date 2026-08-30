"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconLogout, IconMenu2 } from "@tabler/icons-react";
import { Logo } from "@/components/shared/Logo";
import { PageTransition } from "@/components/shared/PageTransition";
import { VsoSidebarNav } from "@/components/vso/VsoSidebarNav";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useVsoStore } from "@/lib/store/vsoStore";

const SIGNIN_PATH = "/vso/signin";

/**
 * The VSO's own desktop-first shell -- deliberately NOT the veteran
 * `(main)` layout (SideNav/BottomNav, mobile-first breakpoints, tab nav
 * gated on onboarding). The VSO is a professional power user at a desk
 * (plan: "Design stance: the inverse of the veteran app"), so desktop keeps
 * the persistent left rail exactly as before. Below `md` the rail's
 * categorized nav (VsoSidebarNav) moves into a slide-in Sheet drawer,
 * triggered from a hamburger button in the compact top bar -- a multi-
 * category expandable nav (Overview strip + 7 categories, 2 with
 * sub-items) is too much to flatten into a top bar the way the old
 * single-link nav was, so unlike before this round, below `md` now gets a
 * second real nav surface, not just the top bar restacking identity/sign-
 * out horizontally.
 *
 * Scroll containment: root `body` is `h-full overflow-hidden` (see
 * app/layout.tsx's comment). This layout's outermost div is `flex-1
 * min-h-0 flex-col` (header row stacked above the rail+content row), not
 * `h-full`, so it participates in that chain instead of fighting it --
 * every child scroll region (VsoPageContainer, the rail's nav list, the
 * drawer's nav list) does the same.
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

  // Controlled (rather than the Sheet's own uncontrolled open state) so
  // VsoSidebarNav's `onNavigate` callback -- fired the instant a category
  // link is clicked -- can close the drawer itself, instead of the tap
  // navigating to a filtered /vso underneath a drawer that's still open.
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  function handleSignOut() {
    signOut();
    router.push(SIGNIN_PATH);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Mobile/tablet top bar -- identity/sign-out restacked horizontally
          (unchanged), plus a new hamburger trigger for the categorized nav
          drawer (Sheet below). Hidden at md: and above, where the rail
          takes over. */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-1">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  aria-label="Open caseload navigation"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-background hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              }
            >
              <IconMenu2 size={20} aria-hidden="true" />
            </SheetTrigger>
            {/* Wider than the primitive's default, matching the desktop
                rail's own 288px (w-72). Labels also wrap instead of
                truncating (VsoSidebarNav) -- width alone can't be a
                permanent fix once the text-scale accessibility control is
                factored in, so this is extra breathing room, not the fix
                itself. */}
            <SheetContent side="left" className="w-[300px] sm:w-80">
              <SheetHeader className="border-b border-border">
                <SheetTitle>Caseload</SheetTitle>
                <SheetDescription>Jump straight to what needs your attention.</SheetDescription>
              </SheetHeader>
              {/* min-h-0 on this flex-1 child, not the fixed-position Sheet
                  popup itself (already height-bounded by inset-y-0), is what
                  lets a long category list scroll here instead of pushing
                  the drawer taller than the viewport -- the same pattern
                  this layout uses everywhere else. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                <Suspense fallback={null}>
                  <VsoSidebarNav onNavigate={() => setDrawerOpen(false)} className="pt-2" />
                </Suspense>
              </div>
            </SheetContent>
          </Sheet>
          <Link
            href="/vso"
            className="flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Logo variant="vso" className="text-base" />
          </Link>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex flex-col items-end text-right leading-tight">
            <span className="text-xs font-medium text-text-primary">{identity.name}</span>
            <span className="text-[11px] text-text-secondary">{identity.organization}</span>
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-background hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconLogout size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="hidden min-h-0 w-72 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <Link
            href="/vso"
            className="flex items-center px-6 py-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Logo variant="vso" />
          </Link>

          <div className="mx-6 border-t border-border" />

          {/* flex-1 min-h-0 + overflow-y-auto: the rail's own scroll region,
              so the Overview strip + 7 categories (2 with sub-items) can
              grow past a short viewport's height without pushing the
              identity/sign-out block (mt-auto below) off-screen or growing
              the whole <aside> past the row's bounds -- the exact
              min-h-0-at-every-level chain this file's own top comment
              documents. */}
          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            <Suspense fallback={null}>
              <VsoSidebarNav />
            </Suspense>
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-border px-6 py-5">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">{identity.name}</span>
              <span className="text-xs text-text-secondary">{identity.organization}</span>
              <span className="text-xs text-text-secondary">Accreditation #{identity.accreditationId}</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2 self-start text-sm text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconLogout size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        {/* min-w-0 alongside min-h-0: this div is a flex ITEM of the row
            above (aside + content), so its default min-width:auto lets wide
            unwrapped descendants (e.g. the inbox's filter controls) push it
            past the flex row's own bound instead of shrinking to it -- the
            same "nested flex child ignores its container's size" trap the
            README documents for min-h-0/scroll containment, just on the
            horizontal axis. Without this, the whole page went wider than the
            viewport on mobile even though every individual control had its
            own wrapping/shrinking rules. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PageTransition className="flex min-h-0 flex-1 flex-col">{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
