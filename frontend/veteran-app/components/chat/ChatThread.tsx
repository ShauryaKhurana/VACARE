"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IconMessageCircle2,
  IconArrowRight,
  IconArrowDown,
  IconShieldCheck,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import type { ChatMessage } from "@/lib/api/types";
import { chatMessagesKey, rewindChatScript } from "@/lib/api/mock/chatScript";
import { cn } from "@/lib/utils";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { DocumentUploadCard } from "@/components/chat/DocumentUploadCard";
import { ConfirmationCard } from "@/components/chat/ConfirmationCard";
import { EligibilityCard } from "@/components/chat/EligibilityCard";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { StatementBuilderCard } from "@/components/chat/StatementBuilderCard";
import { ResumeBanner } from "@/components/chat/ResumeBanner";
import { ChatInputBar, type ChatInputBarHandle } from "@/components/chat/ChatInputBar";
import { RestartClaimDialog } from "@/components/chat/RestartClaimDialog";
import { StepTracker } from "@/components/shared/StepTracker";
import { AccentButton } from "@/components/shared/AccentButton";

const STARTER_PROMPTS = [
  "I'm not sure where to start",
  "I was in the Army and I'm dealing with tinnitus",
  "I have my DD-214 ready to go",
  "I think I have a few conditions to claim",
];

const DIG_STEPS = ["Service info", "Eligibility", "Anything else", "Review"];

/** The scripted turn each step's card is served on -- what a "start over from here" rewind resets the mock's stored turn index to. Review (index 3) is never a rewind target: it's never a "completed" step you tap back into. */
const STEP_REWIND_TURN = [0, 3, 4];

/** The message type that marks where a step's card begins -- rewinding truncates the thread to just before this, keeping everything earlier instead of wiping the whole conversation. Step 0 has no marker: there's nothing earlier to keep. */
const STEP_START_MARKER: (ChatMessage["type"] | null)[] = [null, "eligibility-card", "statement-builder"];

/** What a veteran can flag post-submission -- mirrors Review's four sections, since that's the same breakdown they last saw before it went to their VSO. */
const QUICK_EDIT_TARGETS = ["Service info", "Conditions", "Documents", "Statement"];

/** The exact phrase the scripted closing turn uses -- a stable marker for detecting a resumed, already-finished dig without a dedicated "done" flag on the mock API. */
const REVIEW_HANDOFF_MARKER = "Review & confirm";

/**
 * Affordances for the *current* question rather than a record of what was
 * said. The server re-sends them every turn the question stays open, so they
 * are replaced, never accumulated -- otherwise a veteran who uploads twice
 * ends up looking at a stack of identical upload cards.
 */
const TRANSIENT_TYPES = new Set<ChatMessage["type"]>(["document-upload", "quick-replies"]);

/**
 * Merges a turn into the thread: drops any superseded affordance, then
 * appends only messages the thread does not already hold.
 *
 * The thread merges three sources — messages restored from localStorage, the
 * turn returned by the server, and the optimistic bubble drawn the instant
 * the veteran hits send — so the same id can legitimately arrive twice.
 * React then warns about duplicate keys and may drop or duplicate a bubble.
 */
function appendUnique(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(previous.map((message) => message.id));
  const fresh = incoming.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
  if (fresh.length === 0) return previous;

  // Only clear old affordances when the turn brings replacements; a turn of
  // plain text should leave the veteran's current upload card alone.
  const kept = fresh.some((message) => TRANSIENT_TYPES.has(message.type))
    ? previous.filter((message) => !TRANSIENT_TYPES.has(message.type))
    : previous;

  return [...kept, ...fresh];
}

/**
 * Works out how far the dig got from the thread itself.
 *
 * Progress lived only in React state, so every reload reset it to zero: the
 * rail snapped back to "Service info" and "Start over" greyed out again even
 * though the veteran had already confirmed their DD-214. The conversation is
 * the durable record, so the step count is read back from it.
 */
function deriveStepsDone(messages: ChatMessage[]): number {
  let steps = 0;
  for (const message of messages) {
    if (message.type === "confirmation-card") steps = Math.max(steps, 1);
    if (message.type === "eligibility-card") steps = Math.max(steps, 2);
    if (message.type === "statement-builder") steps = Math.max(steps, 3);
    if (message.type === "ai-text" && message.text.includes(REVIEW_HANDOFF_MARKER)) {
      steps = Math.max(steps, 3);
    }
  }
  return steps;
}

/**
 * Keeps only the most recent of each transient affordance.
 *
 * A thread persisted by an earlier build can already contain a stack of
 * identical upload cards; restoring it verbatim puts them straight back on
 * screen.
 */
function pruneStaleAffordances(messages: ChatMessage[]): ChatMessage[] {
  const lastOfType = new Map<string, string>();
  for (const message of messages) {
    if (TRANSIENT_TYPES.has(message.type)) lastOfType.set(message.type, message.id);
  }
  return messages.filter(
    (message) =>
      !TRANSIENT_TYPES.has(message.type) || lastOfType.get(message.type) === message.id,
  );
}

export function ChatThread() {
  const routingId = useSessionStore((s) => s.routingId);
  const startSession = useSessionStore((s) => s.startSession);
  const markConversationStarted = useSessionStore((s) => s.markConversationStarted);
  const claimSubmitted = useSessionStore((s) => s.claimSubmitted);
  const restartClaim = useSessionStore((s) => s.restartClaim);

  const { data: claim } = useQuery({
    queryKey: ["claim", routingId],
    queryFn: () => apiClient.getClaim(routingId as string),
    enabled: !!routingId,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [stepsDone, setStepsDone] = useState(0);
  const [, setTurnCount] = useState(0);
  const [digComplete, setDigComplete] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  /** null = full restart; a DIG_STEPS index = rewind to just that step. */
  const [restartTarget, setRestartTarget] = useState<number | null>(null);
  const initialized = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputBarHandle>(null);

  useEffect(() => {
    if (!routingId) startSession();
  }, [routingId, startSession]);

  useEffect(() => {
    if (!routingId || initialized.current) return;
    initialized.current = true;

    const stored = window.localStorage.getItem(chatMessagesKey(routingId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (parsed.length > 0) {
          // Deferred until after mount: localStorage is a browser-only API,
          // read once here rather than during render to avoid a hydration
          // mismatch against the server-rendered (empty) thread.
          const restored = pruneStaleAffordances(appendUnique([], parsed));
          setMessages(restored);
          setShowResumeBanner(true);
          if (restored.length > 1) markConversationStarted();
          // Progress has to come back with the conversation, or the rail and
          // "Start over" both reset on every reload.
          setStepsDone(deriveStepsDone(restored));
          if (restored.some((m) => m.type === "ai-text" && m.text.includes(REVIEW_HANDOFF_MARKER))) {
            setDigComplete(true);
          }
          return;
        }
      } catch {
        // fall through to a fresh greeting
      }
    }

    // Read the opening question back rather than posting an empty turn to
    // provoke it: that round trip ran a model call on an empty string and
    // left the veteran looking at a blank thread for several seconds.
    void (async () => {
      setLoading(true);
      try {
        const opening = await apiClient.getMessages(routingId);
        if (opening.length > 0) {
          setMessages(pruneStaleAffordances(opening));
          return;
        }
      } catch {
        // fall through to asking for it
      } finally {
        setLoading(false);
      }
      await advance();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingId]);

  useEffect(() => {
    if (routingId && messages.length > 0) {
      window.localStorage.setItem(chatMessagesKey(routingId), JSON.stringify(messages));
    }
  }, [routingId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const updateJumpVisibility = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpToLatest(distanceFromBottom > 160);
    };

    updateJumpVisibility();
    el.addEventListener("scroll", updateJumpVisibility, { passive: true });
    return () => el.removeEventListener("scroll", updateJumpVisibility);
  }, [messages]);

  async function advance(veteranText?: string) {
    if (!routingId) return;
    if (veteranText) {
      markConversationStarted();
      setMessages((prev) => [
        ...prev,
        { id: `veteran-${Date.now()}`, type: "veteran-text", text: veteranText },
      ]);
    }
    setLoading(true);
    const turn = await apiClient.sendChatMessage(routingId, veteranText ?? "");
    setMessages((prev) => appendUnique(prev, turn));
    setTurnCount((count) => {
      const next = count + 1;
      // The opening greeting (turn 1) is also all-ai-text with no card --
      // only a *later* all-text turn signals the scripted dig has ended.
      if (next > 1 && turn.length > 0 && turn.every((m) => m.type === "ai-text")) {
        setDigComplete(true);
      }
      return next;
    });
    setLoading(false);
  }

  /**
   * Submission is a one-way door (requirements doc, Section 2.15's
   * walkthrough): once a claim is with the VSO, Talk stops advancing the
   * scripted dig and instead relays messages as flagged requests -- the
   * mock's stand-in for the real two-way relay capability (Section 4.3).
   */
  async function sendRelayMessage(text: string) {
    if (!routingId) return;
    markConversationStarted();
    setMessages((prev) => [...prev, { id: `veteran-${Date.now()}`, type: "veteran-text", text }]);
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const vsoName = claim?.vso.name ?? "your VSO";
    setMessages((prev) => [
      ...prev,
      {
        id: `relay-ack-${Date.now()}`,
        type: "ai-text",
        text: `Got it -- I'll pass this along to ${vsoName}. I'll let you know here as soon as they respond.`,
      },
    ]);
    setLoading(false);
  }

  async function handleRestart() {
    if (!routingId) return;
    setRestarting(true);
    const target = restartTarget;

    if (target === null) {
      await apiClient.deleteMyData(routingId);
      restartClaim();
      setMessages([]);
    } else {
      // A targeted rewind, not a full delete -- only the script position and
      // local thread state reset; session flags (onboarding/submission)
      // are untouched, since this only ever runs pre-submission. Truncates
      // forward from the target step instead of clearing everything, so
      // whatever was already confirmed in earlier steps stays on screen.
      const turnIndex = STEP_REWIND_TURN[target];
      rewindChatScript(routingId, turnIndex);
      const marker = STEP_START_MARKER[target];
      const cutIndex = marker ? messages.findIndex((m) => m.type === marker) : 0;
      const preserved = messages.slice(0, cutIndex === -1 ? messages.length : cutIndex);
      setMessages([
        ...preserved,
        {
          id: `restart-note-${Date.now()}`,
          type: "ai-text",
          text: `Let's redo this starting from ${DIG_STEPS[target]}.`,
        },
      ]);
    }

    setStepsDone(target ?? 0);
    setDigComplete(false);
    setShowResumeBanner(false);
    setTurnCount(target !== null ? STEP_REWIND_TURN[target] : 0);
    initialized.current = false;
    setRestarting(false);
    setRestartDialogOpen(false);
    setRestartTarget(null);
    void advance();
  }

  const isSparse = !claimSubmitted && messages.length <= 1 && !showResumeBanner;
  const greeting = messages[0]?.type === "ai-text" ? messages[0].text : null;
  const stepIndex = Math.min(stepsDone, DIG_STEPS.length - 1);
  // Nothing to discard yet if the veteran hasn't moved past Service info --
  // a claim that was already submitted is always a real thing to start over
  // from, regardless of this dig's own step count.
  const canStartOver = claimSubmitted || stepsDone > 0 || messages.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pinned above the scroll area, not inside it -- a veteran should
          never lose sight of where they are (or their claim's status) by
          scrolling, same as the composer never scrolling out of frame.
          Transparent outer strip + a floating surfaced card, matching the
          composer's blend treatment instead of a harsh divider bar. */}
      <div className="bg-transparent p-4 pb-2">
        {claimSubmitted ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-1 rounded-2xl border border-border bg-surface p-4 md:max-w-2xl lg:max-w-3xl">
            <div className="flex items-center gap-2">
              <IconShieldCheck size={18} className="text-accent" aria-hidden="true" />
              <h2 className="text-base font-medium text-text-primary">
                Your claim is with {claim?.vso.name ?? "your VSO"}
              </h2>
            </div>
            <p className="text-sm text-text-secondary">
              They&apos;ll typically review this within a few business days and may reach out
              with questions. We&apos;ll let you know right here the moment anything changes.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col rounded-2xl border border-border bg-surface p-4 md:max-w-2xl lg:max-w-3xl">
            <section
              aria-label={`Claim intake progress: step ${stepIndex + 1} of ${DIG_STEPS.length}, ${DIG_STEPS[stepIndex]}`}
            >
              <StepTracker
                steps={DIG_STEPS}
                currentIndex={stepIndex}
                onStepClick={(i) => {
                  setRestartTarget(i);
                  setRestartDialogOpen(true);
                }}
              />
              {isSparse && (
                <p className="mt-3 text-center text-xs text-text-secondary">
                  This usually takes about 10 minutes, in four short parts.
                </p>
              )}
            </section>
          </div>
        )}

        {/* Its own row, not nested in either card above -- a persistent,
            small pair of utility links common to both states. */}
        <div className="mx-auto mt-2 flex w-full max-w-xl items-center justify-center gap-2 text-xs text-text-secondary md:max-w-2xl lg:max-w-3xl">
          <button
            type="button"
            disabled={!canStartOver}
            onClick={() => {
              setRestartTarget(null);
              setRestartDialogOpen(true);
            }}
            aria-label={canStartOver ? undefined : "Start over -- available once you've said something"}
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            Start over
          </button>
          <span aria-hidden="true">·</span>
          <Link
            href="/you/what-we-store"
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            See what we store
          </Link>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollAreaRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 md:px-8 lg:px-12"
        >
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 md:max-w-2xl lg:max-w-3xl">
            <div
              className={cn(
                "flex flex-1 flex-col gap-3",
                isSparse && "md:justify-center",
              )}
            >
              <div className={cn("flex flex-col gap-3", isSparse && "md:hidden")}>
                {claimSubmitted && (
                  <div className="flex flex-wrap gap-2">
                    {QUICK_EDIT_TARGETS.map((target) => (
                      <button
                        key={target}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          // Prefill, don't send -- the veteran still has to
                          // review the wording and press send themselves.
                          inputRef.current?.setDraft(`I need to update: ${target}`);
                          inputRef.current?.focus();
                        }}
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Edit {target}
                      </button>
                    ))}
                  </div>
                )}

                {/* Its "pick up right where you left off, getting your claim
                    ready" copy only makes sense pre-submission -- once a
                    claim is with a VSO, the pinned header above already
                    says so, and this would otherwise contradict it. */}
                {showResumeBanner && !claimSubmitted && (
                  <ResumeBanner onDismiss={() => setShowResumeBanner(false)} />
                )}

                {messages.map((message) => {
                  switch (message.type) {
                    case "ai-text":
                      return <MessageBubble key={message.id} role="ai" text={message.text} />;
                    case "veteran-text":
                      return <MessageBubble key={message.id} role="veteran" text={message.text} />;
                    case "document-upload":
                      return (
                        <DocumentUploadCard
                          key={message.id}
                          prompt={message.prompt}
                          routingId={routingId ?? ""}
                          onUploaded={(turn) => {
                            markConversationStarted();
                            setMessages((prev) => appendUnique(prev, turn));
                            setStepsDone((n) => Math.max(n, 1));
                          }}
                          onSkip={() => void advance()}
                        />
                      );
                    case "confirmation-card":
                      return (
                        <ConfirmationCard
                          key={message.id}
                          fields={message.fields}
                          onConfirm={() => {
                            setStepsDone((s) => Math.max(s, 1));
                            void advance();
                          }}
                        />
                      );
                    case "eligibility-card":
                      return (
                        <EligibilityCard
                          key={message.id}
                          conditions={message.conditions}
                          onAcknowledge={() => {
                            setStepsDone((s) => Math.max(s, 2));
                            void advance();
                          }}
                        />
                      );
                    case "quick-replies":
                      return (
                        <QuickReplies
                          key={message.id}
                          options={message.options}
                          onSelect={(option) => void advance(option)}
                        />
                      );
                    case "statement-builder":
                      return (
                        <StatementBuilderCard
                          key={message.id}
                          prompt={message.prompt}
                          onSaved={() => {
                            setStepsDone((s) => Math.max(s, 3));
                            void advance();
                          }}
                        />
                      );
                    default:
                      return null;
                  }
                })}

                {loading && (
                  <div
                    className="flex w-fit items-center gap-1.5 rounded-card border border-border bg-surface px-4 py-3"
                    role="status"
                    aria-label="Assistant is typing"
                  >
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary" />
                  </div>
                )}

                {digComplete && !claimSubmitted && (
                  <div className="rounded-card border border-accent/30 bg-accent-tint/40 p-4">
                    <h2 className="text-base font-medium text-text-primary">
                      You&apos;re ready for review
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Take a look before this goes to your VSO -- everything is still editable.
                    </p>
                    <Link href="/review" className="mt-3 block w-fit">
                      <AccentButton type="button">
                        Continue to Review &amp; confirm
                        <IconArrowRight size={18} aria-hidden="true" />
                      </AccentButton>
                    </Link>
                  </div>
                )}
              </div>

              {isSparse && greeting && (
                <div className="hidden flex-col items-center gap-5 pb-2 text-center md:flex">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent-tint text-accent">
                    <IconMessageCircle2 size={32} aria-hidden="true" />
                  </div>
                  <div className="flex max-w-md flex-col gap-2">
                    <h1 className="text-2xl font-medium text-text-primary">
                      Let&apos;s get your claim started
                    </h1>
                    <p className="text-base text-text-secondary">{greeting}</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void advance(prompt)}
                        className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>
        </div>

        {/* A small, barely-there fade under the pinned tracker -- just enough
            to soften the seam where scrolling content passes beneath it. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background to-transparent"
          aria-hidden="true"
        />

        {/* Fades the last visible message into the composer instead of a
            hard cut, and overlays -- doesn't scroll with the content -- a
            "jump to latest" affordance once the veteran has scrolled away
            from the newest message. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent"
          aria-hidden="true"
        />
        {showJumpToLatest && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
            aria-label="Jump to latest message"
            className="absolute bottom-3 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconArrowDown size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <ChatInputBar
        ref={inputRef}
        onSend={(text) => void (claimSubmitted ? sendRelayMessage(text) : advance(text))}
        onAttach={async (file, fileName) => {
          if (!routingId) return;
          markConversationStarted();
          setLoading(true);
          try {
            const turn = await apiClient.uploadDocument(routingId, file, fileName);
            setMessages((prev) => appendUnique(prev, turn));
            // The card path advances the dig; attaching from the composer is
            // the same act and must too, or the progress rail and the
            // "Start over" control stay stuck on step one.
            setStepsDone((n) => Math.max(n, 1));
          } catch (error) {
            setMessages((prev) => [
              ...prev,
              {
                id: `attach-failed-${Date.now()}`,
                type: "ai-text",
                text:
                  error instanceof Error && error.message
                    ? `I couldn't read ${fileName}: ${error.message}`
                    : `I couldn't read ${fileName}. Please try again.`,
              },
            ]);
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading}
      />
      <RestartClaimDialog
        open={restartDialogOpen}
        onOpenChange={setRestartDialogOpen}
        onConfirm={() => void handleRestart()}
        loading={restarting}
        title={restartTarget !== null ? `Redo from ${DIG_STEPS[restartTarget]}?` : undefined}
        description={
          restartTarget !== null
            ? `This keeps everything up through the step before ${DIG_STEPS[restartTarget]} and redoes the rest. If you've already sent a claim to your VSO, that record stays with them either way.`
            : undefined
        }
      />
    </div>
  );
}
