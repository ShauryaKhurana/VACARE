import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** A deliberate, separate action from a quick edit request -- starting over (fully, or from one specific step) clears part or all of the current dig so the veteran can redo it. */
export function RestartClaimDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  title = "Start over?",
  description = "This clears your current conversation so you can redo the dig from scratch. If you've already sent a claim to your VSO, that record stays with them either way -- this only resets what you see here.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-control"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-control"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Starting over…" : "Yes, start over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
