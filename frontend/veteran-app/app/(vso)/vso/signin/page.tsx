"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLockSquareRounded } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";
import { PageTransition } from "@/components/shared/PageTransition";
import { Spinner } from "@/components/shared/Spinner";
import { useVsoStore } from "@/lib/store/vsoStore";

type Step = "form" | "signing-in";

/**
 * Simulated VSO sign-in -- same simulated-auth posture as the veteran
 * app's SignInCard (components/onboarding/SignInCard.tsx): nothing
 * validated, any input works, nothing is stored beyond this browser's
 * localStorage. Built as its own form rather than reusing SignInCard --
 * SignInCard collects a single email field for the veteran's
 * Login.gov/ID.me stand-in, while a signed-in VSO needs three different
 * fields (name, organization, accreditation id) shown throughout the
 * dashboard's rail, and SignInCard is a shared file this phase must not
 * touch. The layout (centered icon, heading, description, form) matches on
 * purpose so it reads as the same real-world moment from the other side.
 */
export default function VsoSignInPage() {
  const router = useRouter();
  const signIn = useVsoStore((s) => s.signIn);
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [accreditationId, setAccreditationId] = useState("");

  useEffect(() => {
    if (step !== "signing-in") return;
    const t = setTimeout(() => {
      signIn({ name, organization, accreditationId });
      router.push("/vso");
    }, 700);
    return () => clearTimeout(t);
  }, [step, name, organization, accreditationId, signIn, router]);

  return (
    <PageTransition transitionKey={step} className="flex min-h-0 flex-1 flex-col">
      {step === "signing-in" ? (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
          <Spinner label="Signing you in" />
          <p className="text-sm text-text-secondary">Signing you in…</p>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-10 text-center md:max-w-2xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-tint text-accent">
            <IconLockSquareRounded size={32} aria-hidden="true" />
          </div>
          <div className="flex max-w-sm flex-col gap-2 md:max-w-md">
            <h1 className="text-2xl font-medium text-text-primary">Sign in as a VSO representative</h1>
            <p className="text-sm text-text-secondary">
              VA.gov verifies accredited reps through Login.gov or ID.me -- this preview simulates
              that step, so nothing here is a real sign-in. Any input works, and nothing is stored.
            </p>
          </div>

          <form
            className="flex w-full max-w-sm flex-col gap-3 text-left md:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              setStep("signing-in");
            }}
          >
            <label htmlFor="vso-name" className="text-sm font-medium text-text-primary">
              Full name
            </label>
            <input
              id="vso-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dana Whitfield"
              required
              className="rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none focus-visible:border-accent"
            />

            <label htmlFor="vso-org" className="text-sm font-medium text-text-primary">
              Organization
            </label>
            <input
              id="vso-org"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Disabled American Veterans"
              required
              className="rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none focus-visible:border-accent"
            />

            <label htmlFor="vso-accred" className="text-sm font-medium text-text-primary">
              Accreditation ID
            </label>
            <input
              id="vso-accred"
              type="text"
              value={accreditationId}
              onChange={(e) => setAccreditationId(e.target.value)}
              placeholder="A12345"
              required
              className="rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none focus-visible:border-accent"
            />

            <p className="text-xs text-text-secondary">
              Only used to label your reviews in this preview -- not shared with the VA and not
              stored anywhere beyond this browser.
            </p>
            <AccentButton type="submit" className="mt-1 w-full">
              Sign in
            </AccentButton>
          </form>
        </div>
      )}
    </PageTransition>
  );
}
