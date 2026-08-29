"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";

function AccessibilityEffects() {
  const textSize = useAccessibilityStore((s) => s.textSize);
  const highContrast = useAccessibilityStore((s) => s.highContrast);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("va-large-text", textSize === "large");
  }, [textSize]);

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
