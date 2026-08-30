import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChatInputBar, type ChatInputBarHandle } from "@/components/chat/ChatInputBar";

describe("ChatInputBar imperative handle", () => {
  it("setDraft populates the composer without sending", () => {
    const onSend = vi.fn();
    const ref = createRef<ChatInputBarHandle>();
    render(<ChatInputBar ref={ref} onSend={onSend} onAttach={() => {}} />);

    act(() => {
      ref.current?.setDraft("I need to update: Conditions");
    });

    const textareas = screen.getAllByLabelText("Message") as HTMLTextAreaElement[];
    expect(textareas.length).toBeGreaterThan(0);
    for (const textarea of textareas) {
      expect(textarea.value).toBe("I need to update: Conditions");
    }
    expect(onSend).not.toHaveBeenCalled();
  });

  it("focus() moves focus into one of the composer's text areas", () => {
    const ref = createRef<ChatInputBarHandle>();
    render(<ChatInputBar ref={ref} onSend={() => {}} onAttach={() => {}} />);

    ref.current?.focus();

    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });

  it("a prefilled draft still requires the veteran to press send", () => {
    const onSend = vi.fn();
    const ref = createRef<ChatInputBarHandle>();
    render(<ChatInputBar ref={ref} onSend={onSend} onAttach={() => {}} />);

    act(() => {
      ref.current?.setDraft("Draft text");
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Send message" })[0]).not.toBeDisabled();
  });
});
