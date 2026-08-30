"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/store/sessionStore";

/**
 * Root redirect (LLD Section 5): no session -> /welcome; session but
 * onboarding incomplete -> /talk; onboarding complete -> /claim. Session
 * state lives in localStorage (Zustand persist), which is only readable
 * client-side -- hence a small client redirect page rather than a true
 * server-side redirect in the root layout.
 */
export default function RootPage() {
  const router = useRouter();
  const routingId = useSessionStore((s) => s.routingId);
  const onboardingComplete = useSessionStore((s) => s.onboardingComplete);

  useEffect(() => {
    if (!routingId) {
      router.replace("/welcome");
    } else if (!onboardingComplete) {
      router.replace("/talk");
    } else {
      router.replace("/claim");
    }
  }, [routingId, onboardingComplete, router]);

  return null;
}
