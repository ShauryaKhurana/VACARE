"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import { VsoCard } from "@/components/you/VsoCard";
import { AccentButton } from "@/components/shared/AccentButton";

export default function ConnectPage() {
  const router = useRouter();
  const routingId = useSessionStore((s) => s.routingId);
  const [matching, setMatching] = useState(true);

  const { data: claim } = useQuery({
    queryKey: ["claim", routingId],
    queryFn: () => apiClient.getClaim(routingId as string),
    enabled: !!routingId,
  });

  useEffect(() => {
    const t = setTimeout(() => setMatching(false), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-10 text-center md:max-w-2xl">
      <h1 className="text-xl font-medium text-text-primary">
        {matching ? "Finding your VSO…" : "You're connected"}
      </h1>

      {matching || !claim ? (
        <div
          className="h-24 w-full max-w-sm animate-pulse rounded-card border border-border bg-accent-tint/40 md:max-w-md"
          role="status"
          aria-label="Matching you with a VSO"
        />
      ) : (
        <>
          <div className="w-full max-w-sm text-left md:max-w-md">
            <VsoCard vso={claim.vso} />
          </div>
          <p className="max-w-sm text-sm text-text-secondary md:max-w-md">
            {claim.vso.name} typically reviews a claim like yours within a few business days and
            may reach out with questions. A real, credentialed person -- not a black box -- is now
            handling your claim.
          </p>
          <AccentButton type="button" onClick={() => router.push("/claim")} className="w-full max-w-sm md:max-w-md">
            Go to My claim
          </AccentButton>
        </>
      )}
    </div>
  );
}
