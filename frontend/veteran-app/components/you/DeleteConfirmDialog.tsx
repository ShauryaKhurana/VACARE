import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * An easy, honest control -- not a dark-pattern maze (HLD Section 4.7).
 * Request and confirm are local dialog state, not two routes.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card">
        <DialogHeader>
          <DialogTitle>Delete your data?</DialogTitle>
          <DialogDescription>
            This removes what we hold on our side -- your routing information and anything you&apos;ve
            shared in this conversation. It doesn&apos;t affect your claim with VA or your VSO, since
            that record lives with them, not us.
          </DialogDescription>
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
            {loading ? "Deleting…" : "Yes, delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
