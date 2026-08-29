"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AccentButton } from "@/components/shared/AccentButton";
import { ComputedTag } from "@/components/shared/ComputedTag";
import type { Condition } from "@/lib/api/types";

/**
 * Guardrail (Deep Dives Section 1.1/1.3): renders only from the structured
 * `conditions` prop, produced by the deterministic presumptive-eligibility
 * rules -- never from free-text model output. Copy is deliberately factual
 * ("may automatically qualify"), never a probability or outcome promise.
 */
export function EligibilityCard({
  conditions,
  onAcknowledge,
}: {
  conditions: Condition[];
  onAcknowledge: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="text-base font-medium text-text-primary">
          You may automatically qualify for these
        </h3>
        <p className="text-sm text-text-secondary">
          These are based on facts already on your DD-214 -- no extra proof needed.
        </p>

        <ul className="flex flex-col gap-2">
          {conditions.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 rounded-control border border-border bg-accent-tint/30 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{c.name}</span>
                <ComputedTag />
              </div>
              {c.reason && <p className="text-sm text-text-secondary">{c.reason}</p>}
            </li>
          ))}
        </ul>

        {acknowledged ? (
          <p className="text-sm text-success" role="status">
            Added to your claim.
          </p>
        ) : (
          <AccentButton
            type="button"
            onClick={() => {
              setAcknowledged(true);
              onAcknowledge();
            }}
          >
            Got it
          </AccentButton>
        )}
      </CardContent>
    </Card>
  );
}
