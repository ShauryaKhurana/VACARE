import { BottomNav } from "@/components/nav/BottomNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <InstallPrompt />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <BottomNav />
    </div>
  );
}
