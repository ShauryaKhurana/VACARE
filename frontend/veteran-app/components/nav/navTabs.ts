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
}

/** Shared by BottomNav (mobile) and TopNav (desktop) so the tab set has one source of truth. */
export const NAV_TABS: readonly NavTab[] = [
  { href: "/talk", label: "Talk", icon: IconMessageCircle2 },
  { href: "/claim", label: "My claim", icon: IconClipboardList },
  { href: "/you", label: "You", icon: IconUser },
];
