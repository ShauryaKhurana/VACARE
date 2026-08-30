import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";
import { speak, stopSpeaking, speechSupported, stripForSpeech } from "@/lib/speech";

/** jsdom ships no speechSynthesis at all, so every test that expects the
 *  feature to be present has to install one. That absence is itself worth
 *  testing -- see "hides the control" below. */
function installSpeechSynthesis() {
  const spoken: string[] = [];
  const cancel = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    writable: true,
    value: {
      cancel,
      speak: (u: { text: string }) => spoken.push(u.text),
    },
  });
  class FakeUtterance {
    text: string;
    rate = 1;
    lang = "";
    constructor(text: string) {
      this.text = text;
    }
  }
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance;
  return { spoken, cancel };
}

function removeSpeechSynthesis() {
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
}

beforeEach(() => {
  useAccessibilityStore.setState({ readAloud: false });
});

afterEach(() => {
  removeSpeechSynthesis();
  vi.restoreAllMocks();
});

describe("speech helpers", () => {
  it("reports unsupported when the browser has no speechSynthesis", () => {
    removeSpeechSynthesis();
    expect(speechSupported()).toBe(false);
  });

  it("speaks the text once support is present", () => {
    const { spoken } = installSpeechSynthesis();
    speak("Saved your phone number.");
    expect(spoken).toEqual(["Saved your phone number."]);
  });

  it("cancels whatever was being read before starting the next message", () => {
    // Answers arrive faster than they can be spoken. Without the cancel the
    // queue grows and the veteran hears a question they already answered.
    const { cancel, spoken } = installSpeechSynthesis();
    speak("First question.");
    speak("Second question.");
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(spoken).toEqual(["First question.", "Second question."]);
  });

  it("does not speak empty or whitespace-only text", () => {
    const { spoken } = installSpeechSynthesis();
    speak("   ");
    expect(spoken).toEqual([]);
  });

  it("stays silent instead of throwing when unsupported", () => {
    removeSpeechSynthesis();
    expect(() => speak("anything")).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });

  it("turns dashes written for the eye into spoken pauses", () => {
    expect(stripForSpeech("Type or speak -- there's no wrong way to start")).toBe(
      "Type or speak, there's no wrong way to start",
    );
    expect(stripForSpeech("Got it — you're rated 10%.")).toBe("Got it, you're rated 10%.");
  });
});

describe("read-aloud toggle in the composer", () => {
  it("hides the control on a browser without speech synthesis", () => {
    removeSpeechSynthesis();
    render(<ChatInputBar onSend={() => {}} onAttach={() => {}} />);
    expect(screen.queryByLabelText("Read messages aloud")).toBeNull();
  });

  it("shows the control and flips the stored preference", () => {
    installSpeechSynthesis();
    render(<ChatInputBar onSend={() => {}} onAttach={() => {}} />);

    // Mobile and desktop layouts both render one; either is the same control.
    const buttons = screen.getAllByLabelText("Read messages aloud");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");

    act(() => {
      buttons[0].click();
    });

    expect(useAccessibilityStore.getState().readAloud).toBe(true);
    expect(
      screen.getAllByLabelText("Turn off reading messages aloud")[0].getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("silences the current sentence when switched off, not just the next one", () => {
    const { cancel } = installSpeechSynthesis();
    useAccessibilityStore.setState({ readAloud: true });
    render(<ChatInputBar onSend={() => {}} onAttach={() => {}} />);

    act(() => {
      screen.getAllByLabelText("Turn off reading messages aloud")[0].click();
    });

    expect(cancel).toHaveBeenCalled();
    expect(useAccessibilityStore.getState().readAloud).toBe(false);
  });
});
