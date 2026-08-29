"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/you/DeleteConfirmDialog";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { PageContainer } from "@/components/shared/PageContainer";

export default function DeletePage() {
  const router = useRouter();
  const routingId = useSessionStore((s) => s.routingId);
  const clearSession = useSessionStore((s) => s.clearSession);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    if (!routingId) return;
    setLoading(true);
    await apiClient.deleteMyData(routingId);
    setLoading(false);
    setDialogOpen(false);
    setDone(true);
    clearSession();
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-medium text-text-primary">Your data has been deleted</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          What we held on our side is gone. Your claim record with VA and your VSO isn&apos;t
          affected -- that stays with them.
        </p>
        <Button className="mt-2 rounded-control" onClick={() => router.push("/welcome")}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-xl font-medium text-text-primary">Delete my data</h1>
      <p className="text-sm text-text-secondary">
        This is a simple, honest control -- no maze, no retention tricks. It removes the routing
        identifier and conversation we hold; it does not touch your claim record with VA or your
        VSO.
      </p>

      <Button
        variant="destructive"
        className="w-fit rounded-control"
        onClick={() => setDialogOpen(true)}
      >
        Delete my data
      </Button>

      <DeleteConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirm}
        loading={loading}
      />
    </PageContainer>
  );
}
