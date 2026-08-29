"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";

function AccessibilityEffects() {
  const textScale = useAccessibilityStore((s) => s.textScale);
  const highContrast = useAccessibilityStore((s) => s.highContrast);

  useEffect(() => {
    document.documentElement.style.setProperty("--va-text-scale", String(textScale / 100));
  }, [textScale]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("va-high-contrast", highContrast);
  }, [highContrast]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityEffects />
      {children}
    </QueryClientProvider>
  );
}
