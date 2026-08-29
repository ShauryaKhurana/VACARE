"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconShare2, IconX } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

const DISMISSED_KEY = "veteran-app-install-prompt-dismissed";

/**
 * iOS Safari never fires `beforeinstallprompt` and only delivers push to a
 * PWA added to the Home Screen (Frontend LLD Section 1's platform
 * constraint) -- so iOS gets a static instructional banner instead of a
 * one-tap install button.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Deferred until after mount: localStorage/matchMedia are browser-only,
    // and this banner defaults to hidden server-side to avoid flashing
    // content that then disagrees with the client's first real render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");

    if (isStandalone()) return;

    if (isIos()) {
      setShowIosBanner(true);
      return;
    }

    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  if (dismissed || (!deferredPrompt && !showIosBanner)) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent-tint/50 px-4 py-3 text-sm text-text-primary">
      {showIosBanner ? (
        <span className="flex-1">
          Add this to your Home Screen for reminders: tap{" "}
          <IconShare2 size={14} className="inline" aria-hidden="true" /> then &quot;Add to Home
          Screen.&quot;
        </span>
      ) : (
        <>
          <span className="flex-1">Install this app for quick access and reminders.</span>
          <AccentButton
            type="button"
            className="h-8 px-3 text-sm"
            onClick={async () => {
              await deferredPrompt?.prompt();
              setDeferredPrompt(null);
              dismiss();
            }}
          >
            <IconDownload size={16} aria-hidden="true" />
            Install
          </AccentButton>
        </>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 text-text-secondary"
      >
        <IconX size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
