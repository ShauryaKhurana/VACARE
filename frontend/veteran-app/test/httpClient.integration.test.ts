import { describe, it, expect, beforeAll } from "vitest";
import { HttpApiClient } from "@/lib/api/http";
import type { ChatMessage } from "@/lib/api/types";

/**
 * Exercises the real client against the real Python backend.
 *
 * Skipped automatically unless the backend is running, so `npm test` stays
 * hermetic. To run it:  python -m src.web   then   npm test
 */

const BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";
let backendUp = false;

beforeAll(async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/app/claims/probe-health`, {
      signal: AbortSignal.timeout(3000),
    });
    backendUp = response.ok;
  } catch {
    backendUp = false;
  }
});

const CLAIM_KEYS = [
  "routingId", "claimType", "stage", "vso",
  "conditions", "needsAttention", "upcoming", "updates",
] as const;

const MESSAGE_TYPES = new Set([
  "ai-text", "veteran-text", "document-upload",
  "confirmation-card", "eligibility-card", "statement-builder",
]);

function routingId(): string {
  return `route-${crypto.randomUUID()}`;
}

describe("HttpApiClient against the live backend", () => {
  it("creates a claim for a client-minted routing id", async () => {
    if (!backendUp) return;
    const client = new HttpApiClient(BASE_URL);
    const id = routingId();

    const claim = await client.getClaim(id);

    expect(claim.routingId).toBe(id);
    for (const key of CLAIM_KEYS) expect(claim).toHaveProperty(key);
    expect(Array.isArray(claim.conditions)).toBe(true);
  });

  it("returns renderable message types from a chat turn", async () => {
    if (!backendUp) return;
    const client = new HttpApiClient(BASE_URL);
    const id = routingId();
    await client.getClaim(id);

    const messages: ChatMessage[] = await client.sendChatMessage(
      id,
      "My ears ring constantly since a blast in 2011.",
    );

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(MESSAGE_TYPES.has(message.type)).toBe(true);
      expect(message.id).toBeTruthy();
    }
    expect(messages.some((m) => m.type === "veteran-text")).toBe(true);
  }, 60_000);

  it("confirms a draft and hands back a vso object", async () => {
    if (!backendUp) return;
    const client = new HttpApiClient(BASE_URL);
    const id = routingId();
    await client.getClaim(id);

    const { vso } = await client.confirmClaimDraft(id);

    expect(vso).toHaveProperty("name");
    expect(vso).toHaveProperty("contactMethods");
    expect(Array.isArray(vso.contactMethods)).toBe(true);
  });

  it("deletes everything held for a routing id", async () => {
    if (!backendUp) return;
    const client = new HttpApiClient(BASE_URL);
    const id = routingId();
    await client.getClaim(id);

    await expect(client.deleteMyData(id)).resolves.toBeUndefined();
  });

  it("surfaces a readable error instead of throwing raw HTML", async () => {
    if (!backendUp) return;
    const client = new HttpApiClient(`${BASE_URL}/nonexistent-prefix`);
    await expect(client.getClaim(routingId())).rejects.toThrow();
  });
});
