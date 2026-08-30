import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import ReviewPage from "@/app/(onboarding)/review/page";
import ConnectPage from "@/app/(onboarding)/connect/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/review",
}));

/**
 * Covers the fix in app/(onboarding)/review/page.tsx and
 * app/(onboarding)/connect/page.tsx: a claim must not reach the VSO
 * (apiClient.confirmClaimDraft / sessionStore.submitClaim) before the
 * veteran has signed in. Review used to do both before ever routing to
 * Connect's sign-in step; now Review only marks the dig finished and
 * navigates, and the real submission happens on Connect's sign-in submit.
 */
describe("sign-in-before-submit gating", () => {
  beforeEach(() => {
    pushMock.mockClear();
    useSessionStore.setState({
      routingId: "route-signin-gating-test",
      onboardingComplete: false,
      conversationStarted: false,
      claimSubmitted: false,
      hasEverSubmitted: false,
    });
  });

  it("Review's confirm button completes onboarding and navigates, without submitting the claim", () => {
    const confirmSpy = vi.spyOn(apiClient, "confirmClaimDraft");

    render(<ReviewPage />);
    fireEvent.click(screen.getByRole("button", { name: /confirm & send to my vso/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useSessionStore.getState().claimSubmitted).toBe(false);
    expect(useSessionStore.getState().onboardingComplete).toBe(true);
    expect(pushMock).toHaveBeenCalledWith("/connect");

    confirmSpy.mockRestore();
  });

  it("Connect opens on the sign-in step, before any submission has happened", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ConnectPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/sign in to send your claim to your vso/i)).toBeInTheDocument();
    expect(useSessionStore.getState().claimSubmitted).toBe(false);
  });

  it("submitting Connect's sign-in form is what actually sends the claim", async () => {
    const confirmSpy = vi.spyOn(apiClient, "confirmClaimDraft");
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ConnectPage />
      </QueryClientProvider>,
    );

    const emailInput = await screen.findByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: "vet@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in & send to my vso/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith("route-signin-gating-test"));
    await waitFor(() => expect(useSessionStore.getState().claimSubmitted).toBe(true));
    await waitFor(() => expect(useSessionStore.getState().hasEverSubmitted).toBe(true));

    // Pacing after the real submission, not a second gate before it.
    expect(await screen.findByText(/finding your vso/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  }, 10000);
});
