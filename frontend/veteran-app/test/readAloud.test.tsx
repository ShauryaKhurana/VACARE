import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";
import {
  speak,
  stopSpeaking,
  speechSupported,
  stripForSpeech,
  splitSentences,
  pickVoice,
} from "@/lib/speech";

/** jsdom ships no speechSynthesis at all, so every test that expects the
 *  feature to be present has to install one. That absence is itself worth
 *  testing -- see "hides the control" below. */
type FakeVoice = { name: string; lang: string; localService: boolean };

function installSpeechSynthesis(voices: FakeVoice[] = []) {
  const spoken: string[] = [];
  const used: (FakeVoice | undefined)[] = [];
  const cancel = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    writable: true,
    value: {
      cancel,
      getVoices: () => voices,
      speak: (u: { text: string; voice?: FakeVoice }) => {
        spoken.push(u.text);
        used.push(u.voice);
      },
    },
  });
  class FakeUtterance {
    text: string;
    rate = 1;
    lang = "";
    voice: FakeVoice | undefined;
    constructor(text: string) {
      this.text = text;
    }
  }
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance;
  return { spoken, used, cancel };
}

const MACOS_DEFAULTS: FakeVoice[] = [
  { name: "Samantha", lang: "en-US", localService: true },
  { name: "Bubbles", lang: "en-US", localService: true },
  { name: "Daniel", lang: "en-GB", localService: true },
  { name: "Sandy (English (United States))", lang: "en-US", localService: true },
  { name: "Shelley (English (United States))", lang: "en-US", localService: true },
  { name: "Anna", lang: "de-DE", localService: true },
];

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

describe("voice selection", () => {
  it("does not settle for the OS default when a warmer voice is installed", () => {
    // macOS defaults to Samantha, the voice that prompted this change.
    const { used } = installSpeechSynthesis(MACOS_DEFAULTS);
    speak("Hello.");
    expect(used[0]?.name).toBe("Sandy (English (United States))");
  });

  it("prefers a neural voice over anything local when one is present", () => {
    const { used } = installSpeechSynthesis([
      ...MACOS_DEFAULTS,
      { name: "Ava (Premium)", lang: "en-US", localService: true },
    ]);
    speak("Hello.");
    expect(used[0]?.name).toBe("Ava (Premium)");
  });

  it("never picks a novelty voice, even though they are English", () => {
    const { used } = installSpeechSynthesis([
      { name: "Bubbles", lang: "en-US", localService: true },
      { name: "Zarvox", lang: "en-US", localService: true },
      { name: "Bad News", lang: "en-US", localService: true },
      { name: "Karen", lang: "en-AU", localService: true },
    ]);
    speak("Hello.");
    expect(used[0]?.name).toBe("Karen");
  });

  it("never picks a voice in another language", () => {
    const { used } = installSpeechSynthesis([
      { name: "Anna", lang: "de-DE", localService: true },
      { name: "Amelie", lang: "fr-CA", localService: true },
    ]);
    speak("Hello.");
    expect(used[0]).toBeUndefined();
  });

  it("returns nothing while the voice list is still loading", () => {
    // Chrome hands back an empty list on the first call and fills it in later.
    installSpeechSynthesis([]);
    expect(pickVoice()).toBeNull();
  });

  it("still speaks when the browser exposes no voice list at all", () => {
    const { spoken } = installSpeechSynthesis();
    Reflect.deleteProperty(window.speechSynthesis as object, "getVoices");
    speak("Hello.");
    expect(spoken).toEqual(["Hello."]);
  });
});

describe("sentence pacing", () => {
  it("queues each sentence separately so the pauses land", () => {
    const { spoken } = installSpeechSynthesis(MACOS_DEFAULTS);
    speak("Saved your phone number. What's your mailing address? The VA sends letters there.");
    expect(spoken).toEqual([
      "Saved your phone number.",
      "What's your mailing address?",
      "The VA sends letters there.",
    ]);
  });

  it("keeps a fragment with no sentence end as one utterance", () => {
    expect(splitSentences("no punctuation here")).toEqual(["no punctuation here"]);
  });
});
