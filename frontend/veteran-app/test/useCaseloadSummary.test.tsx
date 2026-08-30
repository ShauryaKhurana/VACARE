import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCaseloadSummary } from "@/components/vso/useCaseloadSummary";
import { computeCaseloadOverview, computeSystemViewCounts, SYSTEM_VIEWS } from "@/components/vso/caseload";
import { useVsoStore } from "@/lib/store/vsoStore";
import { vsoApiClient } from "@/lib/api/vso/client";

/**
 * Exercises the real mock vsoApiClient (in-repo fixtures, no vi.mock) the
 * same way test/caseConversationHandle.test.tsx does -- this hook's whole
 * point is to be the one place the sidebar and the inbox both read the
 * ["vso-caseload"] query through, so a test that mocked the client out
 * would no longer be testing that the hook's own composition (query +
 * summary derivation) actually holds together.
 */
function renderSummary() {
  const queryClient = new QueryClient();
  return renderHook(() => useCaseloadSummary(), {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

describe("useCaseloadSummary", () => {
  beforeEach(() => {
    useVsoStore.setState({ identity: null, lastSeenMessageIds: {}, filterPresets: [] });
  });

  it("starts loading with an empty row list and all-zero counts", async () => {
    const { result } = renderSummary();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.overview).toEqual({ activeCount: 0, urgentDeadlineCount: 0, unreadCount: 0 });
  });

  it("resolves to one row per queued case, matching the mock client's listQueue", async () => {
    const { result } = renderSummary();
    const queue = await vsoApiClient.listQueue();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toHaveLength(queue.length);
  });

  it("overview and viewCounts match a direct call against the same rows -- no second, drifting computation", async () => {
    const { result } = renderSummary();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.overview).toEqual(computeCaseloadOverview(result.current.rows));
    expect(result.current.viewCounts).toEqual(computeSystemViewCounts(result.current.rows));
  });

  it("viewCounts has an entry for every SYSTEM_VIEWS id", async () => {
    const { result } = renderSummary();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const view of SYSTEM_VIEWS) {
      expect(result.current.viewCounts[view.id]).toBeGreaterThanOrEqual(0);
    }
  });

  it("'all_cases' count equals the total row count -- it's the unfiltered view", async () => {
    const { result } = renderSummary();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.viewCounts.all_cases).toBe(result.current.rows.length);
  });
});
