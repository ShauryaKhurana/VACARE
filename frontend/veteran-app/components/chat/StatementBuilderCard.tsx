"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AccentButton } from "@/components/shared/AccentButton";
import { Button } from "@/components/ui/button";
import { IconLink } from "@tabler/icons-react";

export function StatementBuilderCard({
  prompt,
  onSaved,
}: {
  prompt: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [witnessLinkSent, setWitnessLinkSent] = useState(false);

  return (
    <Card className="rounded-card border-border">
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="text-base font-medium text-text-primary">Personal statement</h3>
        <p className="text-sm text-text-secondary">{prompt}</p>

        {saved ? (
          <p className="text-sm text-success" role="status">
            Saved to your claim.
          </p>
        ) : (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write in your own words -- there's no wrong way to say it."
              className="min-h-28 rounded-control"
              aria-label="Your statement"
            />
            <div className="flex flex-wrap items-center gap-2">
              <AccentButton
                type="button"
                disabled={text.trim().length === 0}
                onClick={() => {
                  setSaved(true);
                  onSaved();
                }}
              >
                Save statement
              </AccentButton>
              <Button
                type="button"
                variant="outline"
                className="rounded-control"
                onClick={() => setWitnessLinkSent(true)}
              >
                <IconLink size={16} aria-hidden="true" />
                Ask a witness for a buddy statement
              </Button>
            </div>
            {witnessLinkSent && (
              <p className="text-sm text-text-secondary" role="status">
                A link is ready to share -- copy it from the conversation whenever you&apos;re ready.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
