import type { AriaAttributes, ComponentType } from "react";
import { IconMessageCircle2, IconClipboardList, IconUser } from "@tabler/icons-react";

type NavIcon = ComponentType<{
  size?: number;
  stroke?: number;
  className?: string;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}>;

export interface NavTab {
  href: string;
  label: string;
  icon: NavIcon;
  /** True for tabs with nothing real to show until a claim has actually been sent to a VSO -- "My claim" has no claim yet, and "You" is mostly about that claim's data. Kept out of the nav until then instead of linking to an empty screen. */
  requiresSubmission?: boolean;
}

/** Shared by BottomNav (mobile) and SideNav (desktop) so the tab set has one source of truth. */
export const NAV_TABS: readonly NavTab[] = [
  { href: "/talk", label: "Talk", icon: IconMessageCircle2 },
  { href: "/claim", label: "My claim", icon: IconClipboardList, requiresSubmission: true },
  { href: "/you", label: "You", icon: IconUser, requiresSubmission: true },
];
