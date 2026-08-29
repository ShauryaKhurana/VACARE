"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AccentButton } from "@/components/shared/AccentButton";
import { ComputedTag } from "@/components/shared/ComputedTag";
import { IconPencil } from "@tabler/icons-react";
import type { ConfirmationField } from "@/lib/api/types";

/**
 * Guardrail (Deep Dives Section 1.1/1.3): this card's primary content is the
 * `fields` prop only -- there is deliberately no free-text/children prop, so
 * a document-parse result can never be rendered from raw LLM prose.
 */
export function ConfirmationCard({
  fields,
  onConfirm,
}: {
  fields: ConfirmationField[];
  onConfirm: () => void;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.label, f.value])));
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-text-primary">What we found</h3>
          <ComputedTag label="System-extracted" />
        </div>

        <dl className="flex flex-col divide-y divide-border">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-sm text-text-secondary">{field.label}</dt>
              {editingLabel === field.label ? (
                <Input
                  autoFocus
                  value={values[field.label]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.label]: e.target.value }))}
                  onBlur={() => setEditingLabel(null)}
                  className="h-8 max-w-[55%] text-right"
                  aria-label={`Edit ${field.label}`}
                />
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-right text-sm font-medium text-text-primary"
                  onClick={() => setEditingLabel(field.label)}
                  disabled={confirmed}
                >
                  <dd>{values[field.label]}</dd>
                  {!confirmed && (
                    <IconPencil size={14} className="text-text-secondary" aria-hidden="true" />
                  )}
                  <span className="sr-only">Edit {field.label}</span>
                </button>
              )}
            </div>
          ))}
        </dl>

        {confirmed ? (
          <p className="text-sm text-success" role="status">
            Looks right -- thanks for confirming.
          </p>
        ) : (
          <AccentButton
            type="button"
            onClick={() => {
              setConfirmed(true);
              onConfirm();
            }}
          >
            Looks right
          </AccentButton>
        )}
      </CardContent>
    </Card>
  );
}
