import { BottomNav } from "@/components/nav/BottomNav";
import { SideNav } from "@/components/nav/SideNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      <SideNav />
      <div className="flex min-h-dvh flex-1 flex-col md:min-h-0">
        <InstallPrompt />
        <main className="flex flex-1 flex-col overflow-hidden md:bg-app-wash">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
