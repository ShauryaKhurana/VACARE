"use client";

import { useState } from "react";
import {
  IconUsers,
  IconBell,
  IconAccessible,
  IconTrash,
  IconLifebuoy,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { SettingsRow } from "@/components/you/SettingsRow";
import { DataStorageBreakdown } from "@/components/you/DataStorageBreakdown";
import { RestartClaimDialog } from "@/components/chat/RestartClaimDialog";
import { PageContainer } from "@/components/shared/PageContainer";

export default function YouPage() {
  const routingId = useSessionStore((s) => s.routingId);
  const restartClaim = useSessionStore((s) => s.restartClaim);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClearConversation() {
    if (!routingId) return;
    setClearing(true);
    await apiClient.deleteMyData(routingId);
    restartClaim();
    setClearing(false);
    setDialogOpen(false);
  }

  return (
    <PageContainer>
      <div>
        <h1 className="text-2xl font-medium text-text-primary md:text-3xl">You</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Exactly what we hold on our side -- no more, no less. Nothing here is hidden behind
          another tap.
        </p>
      </div>

      <DataStorageBreakdown
        conversationAction={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear my conversation
          </button>
        }
      />

      <div className="divide-y divide-border rounded-card border border-border bg-surface">
        <SettingsRow
          href="/you/vso-contact"
          icon={IconUsers}
          label="Your VSO"
          description="Contact info for the person handling your claim"
        />
        <SettingsRow
          href="/you/help"
          icon={IconLifebuoy}
          label="Help"
          description="Reach a human, independent of this app"
        />
        <SettingsRow
          href="/you/notifications"
          icon={IconBell}
          label="Notifications"
          description="Push, text, and email preferences"
        />
        <SettingsRow
          href="/you/accessibility"
          icon={IconAccessible}
          label="Accessibility"
          description="Text size, contrast, and voice input"
        />
        <SettingsRow
          href="/you/delete"
          icon={IconTrash}
          label="Delete my data"
          description="Remove what we hold on our side"
        />
      </div>

      <RestartClaimDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={() => void handleClearConversation()}
        loading={clearing}
      />
    </PageContainer>
  );
}
