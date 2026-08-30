"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInCard } from "@/components/onboarding/SignInCard";
import { useSessionStore } from "@/lib/store/sessionStore";
import { seedReturningVeteranWelcome } from "@/lib/api/mock/chatScript";
import { claimInDevelopment } from "@/lib/api/mock/fixtures";

type Step = "form" | "signing-in";

/**
 * The "Already registered? Sign in" path from Welcome (a returning veteran
 * shouldn't re-run onboarding or the dig) -- skips straight to an
 * already-active claim, as if Review -> Connect had already happened in an
 * earlier session. There's no real backend/auth yet, so this always signs
 * the veteran into the same demo claim-in-progress fixture.
 */
export default function SignInPage() {
  const router = useRouter();
  const signInReturningVeteran = useSessionStore((s) => s.signInReturningVeteran);
  const [step, setStep] = useState<Step>("form");

  useEffect(() => {
    if (step !== "signing-in") return;
    const t = setTimeout(() => {
      signInReturningVeteran(claimInDevelopment.routingId);
      seedReturningVeteranWelcome(claimInDevelopment.routingId, claimInDevelopment.vso.name);
      router.push("/claim");
    }, 900);
    return () => clearTimeout(t);
  }, [step, signInReturningVeteran, router]);

  if (step === "signing-in") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center md:max-w-2xl">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent"
          role="status"
          aria-label="Signing you in"
        />
        <p className="text-sm text-text-secondary">Signing you in…</p>
      </div>
    );
  }

  return (
    <SignInCard
      heading="Sign in to pick up where you left off"
      description="VA.gov verifies your identity through Login.gov or ID.me -- this preview simulates that step, so nothing here is a real sign-in. Any email works, and nothing is stored."
      submitLabel="Sign in"
      onSubmit={() => setStep("signing-in")}
    />
  );
}
