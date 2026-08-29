"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Toggle } from "@/components/shared/Toggle";
import {
  useAccessibilityStore,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  TEXT_SCALE_STEP,
} from "@/lib/store/accessibilityStore";
import { PageContainer } from "@/components/shared/PageContainer";

export default function AccessibilityPage() {
  const textScale = useAccessibilityStore((s) => s.textScale);
  const setTextScale = useAccessibilityStore((s) => s.setTextScale);
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

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">Accessibility</h1>

      <section className="rounded-card border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Text size</h2>
          <span className="text-sm text-text-secondary">{textScale}%</span>
        </div>

        <div
          className="mb-2 flex items-center justify-center rounded-control bg-background py-6 text-text-primary"
          style={{ fontSize: `${(17 * textScale) / 100}px` }}
          aria-hidden="true"
        >
          Aa
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary" aria-hidden="true">
            A
          </span>
          <input
            type="range"
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={TEXT_SCALE_STEP}
            value={textScale}
            onChange={(e) => setTextScale(Number(e.target.value))}
            aria-label="Text size"
            aria-valuetext={`${textScale}%`}
            className="h-2 w-full flex-1 cursor-pointer accent-accent"
          />
          <span className="text-lg text-text-secondary" aria-hidden="true">
            A
          </span>
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
