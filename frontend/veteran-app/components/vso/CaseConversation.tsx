"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconClipboardList, IconMessageCircle2, IconSend } from "@tabler/icons-react";
import { AccentButton } from "@/components/shared/AccentButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isUploadNotice, messageTextForVso } from "@/lib/api/vso/messages";
import { vsoApiClient } from "@/lib/api/vso/client";
import { formatRelativeTime } from "@/components/vso/vsoDisplay";
import type { CaseMessageResponse, MessageAuthor } from "@/lib/api/vso/types";
import { cn } from "@/lib/utils";

/** Real-time-ish contract: the backend's CaseLive polling window is 2.5s
 * (plan: "GET /api/cases/{id}/live -- the 2.5s poll contract"); matching it
 * here means a document a veteran uploads mid-review shows up in this
 * thread without the VSO needing to manually refresh. */
const POLL_INTERVAL_MS = 2_500;

export function caseMessagesKey(caseId: string) {
  return ["vso-messages", caseId] as const;
}

/** Imperative escape hatch matching ChatInputBar's (components/chat/ChatInputBar.tsx)
 * setDraft/focus pair -- same shape, same intent: a caller (a "Request from
 * veteran" button, elsewhere) can populate the composer for the VSO to
 * review and edit, but never send on its behalf. */
export interface CaseConversationHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

function bubbleAlignment(author: MessageAuthor): "start" | "end" | "center" {
  if (author === "system") return "center";
  return author === "vso" ? "end" : "start";
}

function MessageRow({ message }: { message: CaseMessageResponse }) {
  const align = bubbleAlignment(message.author);

  if (align === "center") {
    // System lines (submission notices, upload notices) render as a plain
    // centered note rather than a bubble -- they're narration, not a party
    // in the conversation. Upload notices get the VSO-audience text (plan:
    // mirrors src/collaboration.py message_text_for_vso -- "Veteran
    // uploaded a document." regardless of filename).
    const text = message.author === "system" && isUploadNotice(message.body)
      ? messageTextForVso(message.body)
      : message.body;
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-background px-3 py-1 text-xs text-text-secondary">{text}</span>
      </div>
    );
  }

  const isVso = align === "end";
  return (
    <div className={cn("flex flex-col gap-0.5", isVso ? "items-end" : "items-start")}>
      <span className="px-1 text-xs font-medium text-text-secondary">
        {isVso ? "You" : "Veteran"} · {formatRelativeTime(message.created_at)}
      </span>
      <div
        className={cn(
          "max-w-[80%] rounded-card px-3.5 py-2.5 text-sm",
          isVso ? "bg-accent-tint text-text-primary" : "border border-border bg-background text-text-primary",
        )}
      >
        {message.body}
      </div>
    </div>
  );
}

/**
 * The three-party thread (veteran, AI orchestrator's system notices, VSO)
 * for one case. Deliberately not a reuse of components/chat/ChatThread.tsx
 * (501 lines, hard-coded intake steps, its own localStorage persistence) --
 * only its *patterns* carry over: a bounded scroll region with a bottomRef
 * autoscroll, a jump-to-latest affordance once scrolled away, and a
 * lightweight "sending" indicator while a message is in flight.
 *
 * Scroll containment: this component owns a fixed-height box rather than
 * trying to flex-fill the page's own scroll container (VsoPageContainer) --
 * that sidesteps needing `flex-1 min-h-0` all the way up through a page that
 * itself already scrolls as a whole, while still giving the message list its
 * own internal `flex-1 min-h-0 overflow-y-auto` scroll region beneath a
 * fixed header and above a fixed composer.
 *
 * Exposes setDraft/focus (CaseConversationHandle) so a parent -- the case
 * detail page's "Request from veteran" button -- can prefill and focus the
 * composer without reaching into its state directly, mirroring the veteran
 * app's ChatInputBar handle.
 */
export const CaseConversation = forwardRef<CaseConversationHandle, { caseId: string; vsoName: string }>(
  function CaseConversation({ caseId, vsoName }, ref) {
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      setDraft: (value: string) => setText(value),
      focus: () => {
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        textareaRef.current?.focus();
      },
    }));

    const { data: messages, isLoading } = useQuery({
      queryKey: caseMessagesKey(caseId),
      queryFn: () => vsoApiClient.getMessages(caseId),
      refetchInterval: POLL_INTERVAL_MS,
    });

    function afterSend() {
      setText("");
      void queryClient.invalidateQueries({ queryKey: caseMessagesKey(caseId) });
      // A note or a request can both flip case status (first VSO note opens
      // the case; a request always does) -- invalidate the case-level reads
      // the parent page owns so its status/lane/blockers stay in sync too.
      void queryClient.invalidateQueries({ queryKey: ["vso-case", caseId] });
      void queryClient.invalidateQueries({ queryKey: ["vso-checklist", caseId] });
    }

    const sendNote = useMutation({
      mutationFn: (body: string) => vsoApiClient.postMessage(caseId, { author: "vso", body }),
      onSuccess: afterSend,
    });

    const requestEvidence = useMutation({
      mutationFn: (requestText: string) =>
        vsoApiClient.requestInfo(caseId, { reviewer_name: vsoName, request_text: requestText }),
      onSuccess: afterSend,
    });

    const sending = sendNote.isPending || requestEvidence.isPending;

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, sending]);

    useEffect(() => {
      const el = scrollAreaRef.current;
      if (!el) return;
      const update = () => {
        setShowJumpToLatest(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
      };
      update();
      el.addEventListener("scroll", update, { passive: true });
      return () => el.removeEventListener("scroll", update);
    }, [messages]);

    return (
      <div className="flex h-[30rem] min-h-0 flex-col rounded-card border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <IconMessageCircle2 size={16} className="text-text-secondary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Conversation</h3>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollAreaRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {isLoading ? (
              <p className="text-xs text-text-secondary">Loading conversation…</p>
            ) : messages && messages.length > 0 ? (
              messages.map((message) => <MessageRow key={message.id} message={message} />)
            ) : (
              <p className="text-xs text-text-secondary">No messages yet.</p>
            )}
            {sending && (
              <div
                className="flex w-fit items-center gap-1.5 self-end rounded-card bg-background px-3 py-2"
                role="status"
                aria-label="Sending"
              >
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {showJumpToLatest && (
            <button
              type="button"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
              aria-label="Jump to latest message"
              className="absolute bottom-2 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconArrowDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div ref={composerRef} className="flex flex-col gap-2 border-t border-border p-3">
          <label htmlFor="vso-composer" className="sr-only">
            Message the veteran
          </label>
          <Textarea
            id="vso-composer"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note, or describe what evidence you need…"
            rows={2}
            className="resize-none text-sm"
          />
          {/* Two visibly distinct actions on purpose -- "Send note" is a
              plain thread message (POST /messages), "Request evidence" also
              files a formal follow-up task and flips the case to
              NEEDS_MORE_INFO (POST /vso/request-info). They read differently
              in the backend and must read differently here. */}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sending || text.trim().length === 0}
              onClick={() => sendNote.mutate(text.trim())}
            >
              <IconSend size={14} aria-hidden="true" />
              Send note
            </Button>
            <AccentButton
              type="button"
              className="h-7 gap-1 px-2.5 text-[0.8rem]"
              disabled={sending || text.trim().length === 0}
              onClick={() => requestEvidence.mutate(text.trim())}
            >
              <IconClipboardList size={14} aria-hidden="true" />
              Request evidence
            </AccentButton>
          </div>
        </div>
      </div>
    );
  },
);
