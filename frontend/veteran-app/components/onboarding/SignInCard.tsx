"use client";

import { useState } from "react";
import { IconLockSquareRounded } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";

/**
 * Simulated Login.gov/ID.me sign-in step -- shared between the
 * post-submission account-creation moment (Connect) and a returning
 * veteran's sign-in (Welcome's "Already registered?" path). Same real-world
 * screen, same simulated-auth disclaimer, two different entry points.
 */
export function SignInCard({
  heading,
  description,
  submitLabel = "Continue",
  onSubmit,
}: {
  heading: string;
  description: string;
  submitLabel?: string;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-10 text-center md:max-w-2xl">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-tint text-accent">
        <IconLockSquareRounded size={32} aria-hidden="true" />
      </div>
      <div className="flex max-w-sm flex-col gap-2 md:max-w-md">
        <h1 className="text-2xl font-medium text-text-primary">{heading}</h1>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>

      <form
        className="flex w-full max-w-sm flex-col gap-3 text-left md:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(email);
        }}
      >
        <label htmlFor="signin-email" className="text-sm font-medium text-text-primary">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none focus-visible:border-accent"
        />
        <p className="text-xs text-text-secondary">
          Only used so you can sign back in later -- not shared with your VSO or VA, and not
          stored anywhere in this preview.
        </p>
        <AccentButton type="submit" className="mt-1 w-full">
          {submitLabel}
        </AccentButton>
      </form>
    </div>
  );
}
