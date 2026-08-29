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
        <div
          className="flex divide-x divide-border overflow-hidden rounded-control border border-border"
          role="radiogroup"
          aria-label="Text size"
        >
          {(
            [
              { value: "small", glyph: "A−", fontSize: "14px", label: "Small text" },
              { value: "default", glyph: "A", fontSize: "17px", label: "Default text size" },
              { value: "large", glyph: "A+", fontSize: "20px", label: "Large text" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={textSize === option.value}
              aria-label={option.label}
              onClick={() => setTextSize(option.value)}
              className={cn(
                "flex flex-1 items-center justify-center py-2.5 font-medium",
                textSize === option.value
                  ? "bg-accent-tint text-accent"
                  : "text-text-secondary",
              )}
              style={{ fontSize: option.fontSize }}
            >
              {option.glyph}
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
