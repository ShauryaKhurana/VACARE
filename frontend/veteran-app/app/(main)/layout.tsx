import { BottomNav } from "@/components/nav/BottomNav";
import { TopNav } from "@/components/nav/TopNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopNav />
      <InstallPrompt />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <BottomNav />
    </div>
  );
}
