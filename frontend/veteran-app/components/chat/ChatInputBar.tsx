"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { IconMicrophone, IconMicrophoneOff, IconSend, IconPaperclip } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useAccessibilityStore } from "@/lib/store/accessibilityStore";
import { prepareCapturedFile } from "@/lib/documentCapture";

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

/** Imperative escape hatch for callers that need to populate the composer
 * without sending -- e.g. a quick-action chip that prefills a starting
 * point for a message the veteran still has to review and send themselves.
 * `text` stays fully internal state otherwise; this is the one deliberate
 * crack in that encapsulation. */
export interface ChatInputBarHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

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
 *
 * Renders two layouts sharing one set of state/handlers -- a compact pill
 * bar on mobile (unchanged) and a larger, Claude-style composer on desktop
 * (bigger type, multi-line by default, toolbar row inside the card) -- only
 * one is ever visible at a given viewport via md:, same pattern as
 * ChatThread's own dual mobile/desktop composition.
 */
export const ChatInputBar = forwardRef<
  ChatInputBarHandle,
  {
    onSend: (text: string) => void;
    /** Receives the prepared file itself, not just its name: the composer
     *  previously announced "Attached: X" in the thread and dropped the file. */
    onAttach: (file: Blob, fileName: string) => Promise<void> | void;
    disabled?: boolean;
  }
>(function ChatInputBar({ onSend, onAttach, disabled }, ref) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const voiceDefault = useAccessibilityStore((s) => s.voiceInputDefault);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  // Only one of the two textareas below is ever visible (md: swap) -- calling
  // focus() on both is harmless, since a display:none element silently
  // declines focus, so whichever one is actually on screen wins.
  useImperativeHandle(ref, () => ({
    setDraft: (value: string) => setText(value),
    focus: () => {
      mobileTextareaRef.current?.focus();
      desktopTextareaRef.current?.focus();
    },
  }));

  useEffect(() => {
    // Deferred until after mount: SpeechRecognition is a browser-only API,
    // and checking it during render would make the client's first render
    // disagree with the server-rendered markup.
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

  async function handleFileSelected(file: File) {
    setAttaching(true);
    try {
      const prepared = await prepareCapturedFile(file);
      await onAttach(prepared.blob, file.name);
    } catch {
      // A failed attach here is non-blocking -- the veteran can just try
      // again, or bring the document up when the dig actually asks for it.
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const micButton = voiceSupported && (
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
  );

  return (
    <>
      <label htmlFor="chat-attach" className="sr-only">
        Attach a document
      </label>
      <input
        ref={fileInputRef}
        id="chat-attach"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Ignore an attach while a turn is in flight: both requests would
          // load the same session and the later save would win.
          if (file && !disabled) void handleFileSelected(file);
        }}
      />

      {/* Mobile: compact pill bar, unchanged. */}
      <form
        className="flex items-end gap-2 border-t border-border bg-surface p-3 md:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input-mobile" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input-mobile"
          ref={mobileTextareaRef}
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
        {micButton}
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
        >
          <IconSend size={18} aria-hidden="true" />
        </button>
      </form>

      {/* Desktop: a larger composer card, closer to a modern chat app's
          input than a thin mobile pill -- attach on the left, mic/send in
          a toolbar row under the (multi-line-capable) text area. */}
      <form
        className="hidden bg-transparent p-4 pt-0 md:block"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-border bg-surface p-3 lg:max-w-3xl">
          <label htmlFor="chat-input-desktop" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-input-desktop"
            ref={desktopTextareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={listening ? "Listening…" : "Type or speak -- there's no wrong way to start"}
            rows={2}
            className="w-full resize-none border-0 bg-transparent px-1 text-base text-text-primary outline-none"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attaching}
              aria-label="Attach a document"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-accent-tint hover:text-accent disabled:opacity-50"
            >
              <IconPaperclip size={20} aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2">
              {micButton}
              <button
                type="submit"
                disabled={disabled || text.trim().length === 0}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
              >
                <IconSend size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
});
