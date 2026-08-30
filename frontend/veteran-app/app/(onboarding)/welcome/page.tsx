"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconShieldCheck,
  IconMessageCircle2,
  IconLockSquareRounded,
  IconArrowRight,
} from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";
import { PageTransition } from "@/components/shared/PageTransition";
import { Spinner } from "@/components/shared/Spinner";
import { useSessionStore } from "@/lib/store/sessionStore";
import { chatMessagesKey } from "@/lib/api/mock/chatScript";
import { cn } from "@/lib/utils";

/**
 * Wireframe 0: three cards -- what this is, how it works, privacy + CTA --
 * as local state, not three routes (LLD Section 5). Counters the two
 * biggest trust barriers (HLD Section 4.1) before asking for anything: no
 * account creation, no urgency, no payment ask.
 */
const CARDS = [
  {
    icon: IconShieldCheck,
    heading: "A free guide, working with a real VSO",
    body: "A free guide to help you file your VA claim, working with a real accredited Veteran Service Officer. We never charge you, and we're not a law firm.",
    cta: "Next",
  },
  {
    icon: IconMessageCircle2,
    heading: "You talk, we help, your VSO files",
    body: "You describe your situation in plain language. We help gather what's needed and get it organized. Your accredited VSO reviews everything and handles the actual filing.",
    cta: "Next",
  },
  {
    icon: IconLockSquareRounded,
    heading: "We don't keep a copy of your records",
    body: "We don't keep a copy of your medical records. We help you gather what you need and hand it to your VSO securely.",
    cta: "Let's get started",
  },
] as const;

export default function WelcomePage() {
  const [step, setStep] = useState(0);
  const [resuming, setResuming] = useState(false);
  const router = useRouter();
  const startSession = useSessionStore((s) => s.startSession);

  const isLastCard = step === CARDS.length - 1;
  const card = CARDS[step];
  const Icon = card.icon;

  useEffect(() => {
    if (!resuming) return;
    const t = setTimeout(() => router.push("/talk"), 900);
    return () => clearTimeout(t);
  }, [resuming, router]);

  function handleContinue() {
    if (!isLastCard) {
      setStep((s) => s + 1);
      return;
    }

    // A veteran can land back on Welcome (bookmark, browser back, a fresh
    // tab) with a dig already in progress from an earlier visit -- "Let's
    // get started" shouldn't silently drop them into that same conversation
    // with no acknowledgment that anything carried over, as if it were day
    // one again.
    const existingRoutingId = useSessionStore.getState().routingId;
    const isResuming =
      !!existingRoutingId &&
      typeof window !== "undefined" &&
      !!window.localStorage.getItem(chatMessagesKey(existingRoutingId));

    startSession();
    if (isResuming) {
      setResuming(true);
    } else {
      router.push("/talk");
    }
  }

  if (resuming) {
    return (
      <PageTransition
        transitionKey="resuming"
        className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center md:max-w-lg lg:max-w-xl"
      >
        <Spinner label="Picking up where you left off" />
        <p className="text-sm text-text-secondary">Picking up right where you left off…</p>
      </PageTransition>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col justify-between px-6 py-10 md:max-w-lg lg:max-w-xl">
      <div />

      <PageTransition
        transitionKey={String(step)}
        className="flex flex-col items-center text-center"
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent-tint text-accent">
          <Icon size={32} aria-hidden="true" />
        </div>
        <h1 className="text-2xl md:text-3xl font-medium text-text-primary">{card.heading}</h1>
        <p className="mt-3 text-base text-text-secondary">{card.body}</p>
      </PageTransition>

      <div className="flex flex-col items-center gap-5">
        <div className="flex gap-1.5" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === step ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>

        <AccentButton type="button" className="w-full" onClick={handleContinue}>
          {card.cta}
          {!isLastCard && <IconArrowRight size={18} aria-hidden="true" />}
        </AccentButton>

        <Link
          href="/signin"
          className="text-sm text-text-secondary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Already registered? Sign in
        </Link>
      </div>
    </div>
  );
}
