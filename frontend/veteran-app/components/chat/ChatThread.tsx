"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/lib/store/sessionStore";
import type { ChatMessage } from "@/lib/api/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { DocumentUploadCard } from "@/components/chat/DocumentUploadCard";
import { ConfirmationCard } from "@/components/chat/ConfirmationCard";
import { EligibilityCard } from "@/components/chat/EligibilityCard";
import { StatementBuilderCard } from "@/components/chat/StatementBuilderCard";
import { ProgressChecklist } from "@/components/chat/ProgressChecklist";
import { ResumeBanner } from "@/components/chat/ResumeBanner";
import { ChatInputBar } from "@/components/chat/ChatInputBar";

function storageKey(routingId: string) {
  return `veteran-app-chat-${routingId}`;
}

export function ChatThread() {
  const routingId = useSessionStore((s) => s.routingId);
  const startSession = useSessionStore((s) => s.startSession);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [stepsDone, setStepsDone] = useState(0);
  const initialized = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!routingId) startSession();
  }, [routingId, startSession]);

  useEffect(() => {
    if (!routingId || initialized.current) return;
    initialized.current = true;

    const stored = window.localStorage.getItem(storageKey(routingId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (parsed.length > 0) {
          // Deferred until after mount: localStorage is a browser-only API,
          // read once here rather than during render to avoid a hydration
          // mismatch against the server-rendered (empty) thread.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMessages(parsed);
          setShowResumeBanner(true);
          return;
        }
      } catch {
        // fall through to a fresh greeting
      }
    }

    void advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingId]);

  useEffect(() => {
    if (routingId && messages.length > 0) {
      window.localStorage.setItem(storageKey(routingId), JSON.stringify(messages));
    }
  }, [routingId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function advance(veteranText?: string) {
    if (!routingId) return;
    if (veteranText) {
      setMessages((prev) => [
        ...prev,
        { id: `veteran-${Date.now()}`, type: "veteran-text", text: veteranText },
      ]);
    }
    setLoading(true);
    const turn = await apiClient.sendChatMessage(routingId, veteranText ?? "");
    setMessages((prev) => [...prev, ...turn]);
    setLoading(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-xl flex-col gap-3 md:max-w-2xl lg:max-w-3xl">
          <ProgressChecklist completedSteps={stepsDone} />

          {showResumeBanner && (
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
                    onParsed={() => void advance()}
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
              className="flex items-center gap-1.5 rounded-card border border-border bg-surface px-4 py-3 w-fit"
              role="status"
              aria-label="Assistant is typing"
            >
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-xl md:max-w-2xl lg:max-w-3xl">
        <ChatInputBar onSend={(text) => void advance(text)} disabled={loading} />
      </div>
    </div>
  );
}
