"use client";

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AccentButton } from "@/components/shared/AccentButton";
import { Button } from "@/components/ui/button";
import { prepareCapturedFile } from "@/lib/documentCapture";
import { IconFileUpload, IconAlertTriangle } from "@tabler/icons-react";

type CaptureState = "idle" | "processing" | "uploading" | "parsed" | "parse-failed";

/**
 * Implements the capture state machine from Deep Dives Section 2.4:
 * idle -> capturing -> format-check -> (compress | skip) -> uploading ->
 * awaiting-parse -> parsed | parse-failed. There's no real backend, so
 * "uploading"/"awaiting-parse" is a short simulated delay that resolves to
 * a canned result -- but HEIC detection and compression themselves are real.
 */
export function DocumentUploadCard({
  prompt,
  onParsed,
}: {
  prompt: string;
  onParsed: () => void;
}) {
  const [state, setState] = useState<CaptureState>("idle");
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setState("processing");
    try {
      await prepareCapturedFile(file);
      setState("uploading");
      await new Promise((r) => setTimeout(r, 900));
      setState("parsed");
      onParsed();
    } catch {
      setAttempts((a) => a + 1);
      setState("parse-failed");
    }
  }

  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-base text-text-primary">{prompt}</p>

        {state === "idle" && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take or choose a photo of your document"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <AccentButton
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full"
            >
              <IconFileUpload size={18} aria-hidden="true" />
              Take or choose a photo
            </AccentButton>
          </>
        )}

        {(state === "processing" || state === "uploading") && (
          <div
            className="flex items-center gap-2 rounded-control border border-border bg-accent-tint/40 px-3 py-2 text-sm text-text-secondary"
            role="status"
            aria-live="polite"
          >
            <span className="h-4 w-4 animate-pulse rounded-full bg-computed/40" aria-hidden="true" />
            {state === "processing" ? "Preparing your photo…" : "Reading your document…"}
          </div>
        )}

        {state === "parsed" && (
          <p className="text-sm text-success" role="status">
            Got it -- see the summary below.
          </p>
        )}

        {state === "parse-failed" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-warning">
              <IconAlertTriangle size={16} aria-hidden="true" />
              That photo didn&apos;t come through clearly. Want to try again?
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-control"
                onClick={() => {
                  setState("idle");
                  inputRef.current?.click();
                }}
              >
                Retake photo
              </Button>
              {attempts >= 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-control"
                  onClick={() => {
                    setState("parsed");
                    onParsed();
                  }}
                >
                  Enter details manually instead
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
