"use client";

import { useEffect, useRef, useState } from "react";
import { IconMicrophone, IconMicrophoneOff, IconSend } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";

// Web Speech API isn't in TypeScript's DOM lib yet; a minimal shape covers
// what this component actually uses.
interface MinimalSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice input is progressive enhancement (LLD Section 8): the mic toggle is
 * hidden entirely on unsupported browsers rather than shown broken, and
 * every flow here is completable via text/tap alone.
 */
export function ChatInputBar({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const voiceDefault = useAccessibilityStore((s) => s.voiceInputDefault);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    // Deferred until after mount: SpeechRecognition is a browser-only API,
    // and checking it during render would make the client's first render
    // disagree with the server-rendered markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  function toggleVoice() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={listening ? "Listening…" : "Type or speak"}
        rows={1}
        className="min-h-11 flex-1 resize-none rounded-full border border-border bg-background px-4 py-2.5 text-base text-text-primary outline-none focus-visible:border-accent"
      />
      {voiceSupported && (
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={listening}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
            listening
              ? "border-accent bg-accent-tint text-accent"
              : "border-border bg-background text-text-secondary",
          )}
          data-default-on={voiceDefault || undefined}
        >
          {listening ? (
            <IconMicrophoneOff size={20} aria-hidden="true" />
          ) : (
            <IconMicrophone size={20} aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="submit"
        disabled={disabled || text.trim().length === 0}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
      >
        <IconSend size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
