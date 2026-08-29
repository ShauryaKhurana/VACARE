"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Toggle } from "@/components/shared/Toggle";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/shared/PageContainer";

export default function AccessibilityPage() {
  const textSize = useAccessibilityStore((s) => s.textSize);
  const setTextSize = useAccessibilityStore((s) => s.setTextSize);
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const setHighContrast = useAccessibilityStore((s) => s.setHighContrast);
  const voiceInputDefault = useAccessibilityStore((s) => s.voiceInputDefault);
  const setVoiceInputDefault = useAccessibilityStore((s) => s.setVoiceInputDefault);

  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-xl font-medium text-text-primary">Accessibility</h1>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 text-base font-medium text-text-primary">Text size</h2>
        <div className="flex gap-2" role="radiogroup" aria-label="Text size">
          {(["default", "large"] as const).map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={textSize === size}
              onClick={() => setTextSize(size)}
              className={cn(
                "rounded-control border px-4 py-2 text-sm",
                textSize === size
                  ? "border-accent bg-accent-tint text-accent font-medium"
                  : "border-border text-text-secondary",
              )}
            >
              {size === "default" ? "Default" : "Large"}
            </button>
          ))}
        </div>
      </section>

      <div className="rounded-card border border-border bg-surface px-4">
        <Toggle
          id="high-contrast"
          label="High-contrast mode"
          description="Stronger color contrast throughout the app"
          checked={highContrast}
          onCheckedChange={setHighContrast}
        />
        <Toggle
          id="voice-default"
          label="Voice input by default"
          description="Start conversations with the microphone on, where supported"
          checked={voiceInputDefault}
          onCheckedChange={setVoiceInputDefault}
        />
      </div>
    </PageContainer>
  );
}
