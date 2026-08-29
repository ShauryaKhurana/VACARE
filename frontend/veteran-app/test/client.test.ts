import { describe, it, expect } from "vitest";
import { apiClient } from "@/lib/api/client";
import { claimResolvedDenied } from "@/lib/api/mock/fixtures";

describe("mock apiClient", () => {
  it("returns the matching fixture for a known routing id", async () => {
    const claim = await apiClient.getClaim(claimResolvedDenied.routingId);
    expect(claim).toEqual(claimResolvedDenied);
  });

  it("falls back to a default fixture for an unrecognized routing id, preserving the routing id", async () => {
    const claim = await apiClient.getClaim("route-brand-new-session");
    expect(claim.routingId).toBe("route-brand-new-session");
    expect(claim.conditions.length).toBeGreaterThan(0);
  });

  it("advances the scripted chat sequence one turn per call, starting with the greeting", async () => {
    const routingId = `route-chat-test-${Math.random()}`;
    const first = await apiClient.sendChatMessage(routingId, "");
    expect(first[0]).toMatchObject({ type: "ai-text" });

    const second = await apiClient.sendChatMessage(routingId, "I hurt my shoulder in the Army");
    expect(second.some((m) => m.type === "document-upload")).toBe(true);
  });

  it("resolves deleteMyData without throwing", async () => {
    await expect(apiClient.deleteMyData("route-any")).resolves.toBeUndefined();
  });
});
