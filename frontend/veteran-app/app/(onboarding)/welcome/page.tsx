"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconShieldCheck, IconLockSquareRounded, IconArrowRight } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";
import { useSessionStore } from "@/lib/store/sessionStore";
import { cn } from "@/lib/utils";

/**
 * HLD Section 4.1: counter the two biggest trust barriers -- fear of being
 * scammed and fear of losing control of medical/service data -- before
 * asking for anything. A 3-card sequence as local state, not 3 routes
 * (LLD Section 5); no account creation, no urgency, no payment ask.
 */
const CARDS = [
  {
    icon: IconShieldCheck,
    heading: "A free guide, working with a real VSO",
    body: "A free guide to help you file your VA claim, working with a real accredited Veteran Service Officer. We never charge you, and we're not a law firm.",
  },
  {
    icon: IconLockSquareRounded,
    heading: "We don't keep a copy of your records",
    body: "We don't keep a copy of your medical records. We help you gather what you need and hand it to your VSO securely.",
  },
];

export default function WelcomePage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const startSession = useSessionStore((s) => s.startSession);

  const isLastCard = step === CARDS.length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col justify-between px-6 py-10">
      <div />

      <div className="flex flex-col items-center text-center">
        {!isLastCard ? (
          (() => {
            const card = CARDS[step];
            const Icon = card.icon;
            return (
              <>
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent-tint text-accent">
                  <Icon size={32} aria-hidden="true" />
                </div>
                <h1 className="text-xl font-medium text-text-primary">{card.heading}</h1>
                <p className="mt-3 text-base text-text-secondary">{card.body}</p>
              </>
            );
          })()
        ) : (
          <>
            <h1 className="text-xl font-medium text-text-primary">Ready when you are</h1>
            <p className="mt-3 text-base text-text-secondary">
              No account needed to begin -- just start talking, and we&apos;ll take it from there.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="flex gap-1.5" aria-hidden="true">
          {[...CARDS, {}].map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === step ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>

        {isLastCard ? (
          <AccentButton
            type="button"
            className="w-full"
            onClick={() => {
              startSession();
              router.push("/talk");
            }}
          >
            Let&apos;s get started
          </AccentButton>
        ) : (
          <AccentButton
            type="button"
            className="w-full"
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
            <IconArrowRight size={18} aria-hidden="true" />
          </AccentButton>
        )}
      </div>
    </div>
  );
}
