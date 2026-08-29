import {
  IconUsers,
  IconBell,
  IconAccessible,
  IconTrash,
  IconLifebuoy,
} from "@tabler/icons-react";
import { DataSummaryCard } from "@/components/you/DataSummaryCard";
import { SettingsRow } from "@/components/you/SettingsRow";

export default function YouPage() {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-6">
        <h1 className="text-xl font-medium text-text-primary">You</h1>

        <DataSummaryCard />

        <div className="flex flex-col gap-2">
          <SettingsRow
            href="/you/vso-contact"
            icon={IconUsers}
            label="Your VSO"
            description="Contact info for the person handling your claim"
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
            href="/you/help"
            icon={IconLifebuoy}
            label="Help"
            description="Reach a human, independent of this app"
          />
          <SettingsRow
            href="/you/delete"
            icon={IconTrash}
            label="Delete my data"
            description="Remove what we hold on our side"
          />
        </div>
      </div>
    </div>
  );
}
