import type { Claim, ChatMessage, RoutingId, VsoInfo } from "@/lib/api/types";
import {
  defaultFixture,
  fixturesByRoutingId,
} from "@/lib/api/mock/fixtures";
import { getNextChatTurn } from "@/lib/api/mock/chatScript";

export interface ApiClient {
  getClaim(routingId: RoutingId): Promise<Claim>;
  sendChatMessage(routingId: RoutingId, text: string): Promise<ChatMessage[]>;
  confirmClaimDraft(routingId: RoutingId): Promise<{ vso: VsoInfo }>;
  deleteMyData(routingId: RoutingId): Promise<void>;
}

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Mock implementation. This is the entire contract the rest of the app
 * depends on (LLD Section 6.3) -- when a real backend exists, only this
 * file's implementation changes; no component should ever need to know
 * whether it's talking to mock fixtures or a live API.
 */
class MockApiClient implements ApiClient {
  async getClaim(routingId: RoutingId): Promise<Claim> {
    const claim = fixturesByRoutingId[routingId] ?? {
      ...defaultFixture,
      routingId,
    };
    return delay(claim);
  }

  async sendChatMessage(routingId: RoutingId, _text: string): Promise<ChatMessage[]> {
    const turn = getNextChatTurn(routingId);
    return delay(turn, MOCK_LATENCY_MS + 300);
  }

  async confirmClaimDraft(_routingId: RoutingId): Promise<{ vso: VsoInfo }> {
    const claim = defaultFixture;
    return delay({ vso: claim.vso });
  }

  async deleteMyData(_routingId: RoutingId): Promise<void> {
    return delay(undefined, 600);
  }
}

// A real implementation would live alongside this one and be selected here
// based on MOCK_MODE, per LLD Section 6.2. There's no real backend yet, so
// mock is the only implementation for now.
export const apiClient: ApiClient = new MockApiClient();
