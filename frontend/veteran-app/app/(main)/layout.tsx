"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav/BottomNav";
import { SideNav } from "@/components/nav/SideNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { useSessionStore } from "@/lib/store/sessionStore";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const onboardingComplete = useSessionStore((s) => s.onboardingComplete);
  const conversationStarted = useSessionStore((s) => s.conversationStarted);

  // Deferred until after mount: the persisted session store reads localStorage,
  // so the server-rendered pass (and the client's first paint, before Zustand's
  // persist middleware rehydrates) always sees the un-hydrated defaults --
  // start with chrome hidden to match that, then flip once mounted, same
  // pattern ChatThread uses for its own localStorage-backed state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Per Frontend HLD Section 3: the three-tab nav is a surface that appears
  // "after first run" -- a veteran meeting the orchestrator for the first
  // time (still on Welcome/the dig, before sending a real message) shouldn't
  // see app chrome for screens ("My claim", "You") that don't have anything
  // in them yet. It appears the moment they've actually started talking, and
  // stays for every return visit after that.
  const showChrome = mounted && (onboardingComplete || conversationStarted);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      {showChrome && <SideNav />}
      <div className="flex min-h-0 flex-1 flex-col">
        <InstallPrompt />
        <main
          id="main-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden md:bg-app-wash"
        >
          {children}
        </main>
        {showChrome && <BottomNav />}
      </div>
    </div>
  );
}
