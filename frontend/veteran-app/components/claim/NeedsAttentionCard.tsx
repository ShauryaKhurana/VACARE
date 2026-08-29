import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/shared/StatusTag";
import type { AttentionItem } from "@/lib/api/types";

/** Each item has a single tappable action, not a passive notice (HLD Section 4.5). */
export function NeedsAttentionCard({ item }: { item: AttentionItem }) {
  return (
    <Card className="rounded-card border-warning/30 bg-warning/5">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-medium text-text-primary">{item.title}</h3>
          <StatusTag variant="warning" label="Needs you" />
        </div>
        <p className="text-sm text-text-secondary">{item.detail}</p>
        <Button variant="outline" className="w-fit rounded-control" type="button">
          {item.actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
