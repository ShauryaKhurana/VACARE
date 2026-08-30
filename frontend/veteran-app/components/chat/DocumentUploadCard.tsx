"use client";

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AccentButton } from "@/components/shared/AccentButton";
import { Button } from "@/components/ui/button";
import { prepareCapturedFile } from "@/lib/documentCapture";
import { apiClient } from "@/lib/api/client";
import type { ChatMessage } from "@/lib/api/types";
import { IconFileUpload, IconAlertTriangle } from "@tabler/icons-react";

type CaptureState = "idle" | "processing" | "uploading" | "parsed" | "parse-failed";

/**
 * Implements the capture state machine from Deep Dives Section 2.4:
 * idle -> capturing -> format-check -> (compress | skip) -> uploading ->
 * awaiting-parse -> parsed | parse-failed.
 *
 * The upload is real now. It previously waited 900ms and threw the file
 * away, which meant a veteran could pick their DD-214, see "Got it", and
 * have nothing reach the server -- the conversation then re-asked for the
 * same document forever.
 */
export function DocumentUploadCard({
  prompt,
  routingId,
  onUploaded,
  onSkip,
}: {
  prompt: string;
  routingId: string;
  onUploaded: (messages: ChatMessage[]) => void;
  onSkip: () => void;
}) {
  const [state, setState] = useState<CaptureState>("idle");
  const [attempts, setAttempts] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setState("processing");
    try {
      const prepared = await prepareCapturedFile(file);
      setState("uploading");
      const messages = await apiClient.uploadDocument(routingId, prepared.blob, file.name);
      setState("parsed");
      onUploaded(messages);
    } catch (error) {
      setAttempts((a) => a + 1);
      setErrorText(
        error instanceof Error && error.message
          ? error.message
          : "That file didn't come through clearly.",
      );
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
              accept="image/*,application/pdf,.pdf,.heic"
              className="sr-only"
              aria-label="Take a photo or choose a file for your document"
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
              Take a photo or choose a file
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
              {errorText ?? "That file didn't come through clearly."} Want to try again?
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
                Try another file
              </Button>
              {attempts >= 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-control"
                  onClick={() => {
                    setState("parsed");
                    onSkip();
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
