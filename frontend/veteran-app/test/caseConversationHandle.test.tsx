import { createRef } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaseConversation, type CaseConversationHandle } from "@/components/vso/CaseConversation";

const CASE_ID = "4f2a91c7e6b3";

function renderConversation() {
  const queryClient = new QueryClient();
  const ref = createRef<CaseConversationHandle>();
  render(
    <QueryClientProvider client={queryClient}>
      <CaseConversation ref={ref} caseId={CASE_ID} vsoName="Dana Whitfield" />
    </QueryClientProvider>,
  );
  return ref;
}

/**
 * Covers the "Request from veteran" prefill fix (app/(vso)/vso/cases/[caseId]/page.tsx):
 * the button used to call requestItem.mutate(item) immediately, sending a
 * request the VSO never reviewed. It now populates this composer via
 * setDraft/focus instead, mirroring ChatInputBarHandle on the veteran side.
 */
describe("CaseConversation imperative handle", () => {
  it("setDraft populates the composer without sending a request", async () => {
    const ref = renderConversation();
    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.setDraft("Please provide: DD-214 (discharge document)");
    });

    const composer = (await screen.findByLabelText(
      /message the veteran/i,
    )) as HTMLTextAreaElement;
    expect(composer.value).toBe("Please provide: DD-214 (discharge document)");
    expect(screen.getByRole("button", { name: /request evidence/i })).toBeInTheDocument();
    // Nothing was sent -- "Request evidence" is still disabled-until-clicked,
    // it's just pre-armed with the drafted text.
  });

  it("focus() moves focus into the composer textarea", async () => {
    const ref = renderConversation();
    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.setDraft("Please provide: DD-214");
      ref.current?.focus();
    });

    const composer = await screen.findByLabelText(/message the veteran/i);
    expect(document.activeElement).toBe(composer);
  });
});
