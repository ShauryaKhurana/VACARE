import type { ChatMessage } from "@/lib/api/types";

/**
 * Scripted, deterministic stand-in for the real conversation, which per the
 * Frontend Deep Dives (Section 1) will eventually be powered by a streaming
 * AI SDK endpoint backed by real tool calls (parseDocument, computeEligibility).
 * That backend doesn't exist yet, so this walks a fixed sequence instead --
 * one scripted "turn" of AI messages/cards per veteran message sent. The
 * message shapes (ConfirmationCard fields, EligibilityCard conditions) match
 * the real tool-result contracts exactly, so swapping this file for a real
 * streaming client later shouldn't require touching any card component.
 */

let id = 0;
function nextId(): string {
  id += 1;
  return `mock-${id}`;
}

// script[0] is shown immediately on thread mount, via an automatic empty
// first call to sendChatMessage -- every later index advances one veteran
// message at a time.
const script: ChatMessage[][] = [
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "Hi, I'm here to help you get your VA claim ready. Tell me a bit about your service and what's been bothering you since -- there's no wrong way to start.",
    },
  ],
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "Thanks for sharing that. Got your DD-214 handy? Snap a photo and I'll pull the details so you don't have to type them in.",
    },
    {
      id: nextId(),
      type: "document-upload",
      prompt: "Add your DD-214",
      documentType: "dd214",
    },
  ],
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "Got it. Here's what I found -- take a look and let me know if anything needs fixing.",
    },
    {
      id: nextId(),
      type: "confirmation-card",
      fields: [
        { label: "Name", value: "Jamie R." },
        { label: "Branch", value: "U.S. Army" },
        { label: "Service dates", value: "Jun 2009 - Aug 2017" },
        { label: "Discharge type", value: "Honorable" },
        { label: "Campaign medals", value: "Iraq Campaign Medal" },
        { label: "Job code (MOS)", value: "11B - Infantryman" },
      ],
    },
  ],
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "Based on your service dates and job code, you may automatically qualify for some conditions -- no extra proof needed for these.",
    },
    {
      id: nextId(),
      type: "eligibility-card",
      conditions: [
        {
          id: "elig-1",
          name: "Tinnitus",
          outcome: "pending",
          computedEligible: true,
          reason: "Your job code (11B) is on VA's noise-exposure list.",
        },
        {
          id: "elig-2",
          name: "Burn-pit related conditions",
          outcome: "pending",
          computedEligible: true,
          reason: "Your deployment location and dates match a PACT Act exposure zone.",
        },
      ],
    },
  ],
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "You also mentioned a shoulder injury that was never officially reported. That's common, and it's still worth including -- let's put together a short personal statement describing what happened.",
    },
    {
      id: nextId(),
      type: "statement-builder",
      prompt: "Tell me what happened, roughly when, and how it's affected you since.",
    },
  ],
  [
    {
      id: nextId(),
      type: "ai-text",
      text: "That's everything I need for now. When you're ready, head to Review & confirm to check everything over before it goes to your VSO.",
    },
  ],
];

const turnIndexByRoutingId = new Map<string, number>();

export function getNextChatTurn(routingId: string): ChatMessage[] {
  const currentIndex = turnIndexByRoutingId.get(routingId) ?? 0;
  const turn = script[Math.min(currentIndex, script.length - 1)];
  turnIndexByRoutingId.set(routingId, Math.min(currentIndex + 1, script.length));
  return turn;
}

export function resetChatScript(routingId: string): void {
  turnIndexByRoutingId.delete(routingId);
}
