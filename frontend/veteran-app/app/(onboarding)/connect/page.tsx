"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { VsoCard } from "@/components/you/VsoCard";
import { AccentButton } from "@/components/shared/AccentButton";
import { SignInCard } from "@/components/onboarding/SignInCard";
import { PageTransition } from "@/components/shared/PageTransition";
import { Spinner } from "@/components/shared/Spinner";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

type Step = "matching" | "connected" | "redirecting" | "sign-in";

export default function ConnectPage() {
  const router = useRouter();
  const routingId = useSessionStore((s) => s.routingId);
  const [step, setStep] = useState<Step>("matching");

  const { data: claim } = useQuery({
    queryKey: ["claim", routingId],
    queryFn: () => apiClient.getClaim(routingId as string),
    enabled: !!routingId,
  });

  useEffect(() => {
    const t = setTimeout(() => setStep("connected"), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step !== "redirecting") return;
    const t = setTimeout(() => setStep("sign-in"), 900);
    return () => clearTimeout(t);
  }, [step]);

  let content: React.ReactNode;

  if (step === "redirecting") {
    content = (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center md:max-w-2xl">
        <Spinner label="Redirecting you to sign in" />
        <p className="text-sm text-text-secondary">Redirecting you to sign in…</p>
      </div>
    );
  } else if (step === "sign-in") {
    content = (
      <SignInCard
        heading="Sign in to save your progress"
        description="VA.gov verifies your identity through Login.gov or ID.me before linking a claim to your account -- this preview simulates that step, so nothing here is a real sign-in."
        onSubmit={() => router.push("/claim")}
      />
    );
  } else {
    content = (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-10 text-center md:max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-medium text-text-primary">
          {step === "matching" ? "Finding your VSO…" : "You're connected"}
        </h1>

        {step === "matching" || !claim ? (
          <LoadingSkeleton
            label="Matching you with a VSO"
            className="h-24 max-w-sm md:max-w-md"
          />
        ) : (
          <>
            <div className="w-full max-w-sm text-left md:max-w-md">
              <VsoCard vso={claim.vso} />
            </div>
            <div className="w-full max-w-sm text-left md:max-w-md">
              <h2 className="text-sm font-medium text-text-primary">What happens next</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {claim.vso.name} typically reviews a claim like yours within a few business days
                and may reach out with questions. A real, credentialed person -- not a black box --
                is now handling your claim.
              </p>
            </div>
            <AccentButton
              type="button"
              onClick={() => setStep("redirecting")}
              className="w-full max-w-sm md:max-w-md"
            >
              Continue to my claim
            </AccentButton>
          </>
        )}
      </div>
    );
  }

  return (
    <PageTransition transitionKey={step} className="flex min-h-0 flex-1 flex-col">
      {content}
    </PageTransition>
  );
}
