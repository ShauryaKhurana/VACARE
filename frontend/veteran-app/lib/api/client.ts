import type { Claim, ChatMessage, RoutingId, VsoInfo } from "@/lib/api/types";
import {
  defaultFixture,
  fixturesByRoutingId,
} from "@/lib/api/mock/fixtures";
import { getNextChatTurn, resetChatScript, chatMessagesKey } from "@/lib/api/mock/chatScript";
import { HttpApiClient } from "@/lib/api/http";

export interface ApiClient {
  getClaim(routingId: RoutingId): Promise<Claim>;
  sendChatMessage(routingId: RoutingId, text: string): Promise<ChatMessage[]>;
  /** The conversation so far. Used on open so the first question can be read
   *  back rather than triggering a new turn. */
  getMessages(routingId: RoutingId): Promise<ChatMessage[]>;
  /** Sends a captured document and returns the turn it produced. */
  uploadDocument(routingId: RoutingId, file: File | Blob, filename: string): Promise<ChatMessage[]>;
  /** Where the veteran can download their filled draft 21-526EZ, or null
   *  when there is no backend to generate one. */
  formDownloadUrl(routingId: RoutingId): string | null;
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

  async getMessages(_routingId: RoutingId): Promise<ChatMessage[]> {
    // The mock has no server-side transcript; the caller falls back to
    // running a turn, which is how it always behaved.
    return delay([], 0);
  }

  async uploadDocument(
    routingId: RoutingId,
    _file: File | Blob,
    filename: string,
  ): Promise<ChatMessage[]> {
    // No backend to parse it, so acknowledge the file and advance the script.
    const turn = getNextChatTurn(routingId);
    return delay(
      [
        { id: `upload-${Date.now()}`, type: "veteran-text", text: `[uploaded ${filename}]` },
        ...turn,
      ] as ChatMessage[],
      MOCK_LATENCY_MS + 300,
    );
  }

  formDownloadUrl(_routingId: RoutingId): string | null {
    return null;      // nothing to fill a form from without a backend
  }

  async confirmClaimDraft(_routingId: RoutingId): Promise<{ vso: VsoInfo }> {
    const claim = defaultFixture;
    return delay({ vso: claim.vso });
  }

  async deleteMyData(routingId: RoutingId): Promise<void> {
    // Actually remove what "Delete my data" promises to remove -- the
    // routing identifier itself is cleared separately by the caller via
    // sessionStore.clearSession(), but the conversation and script progress
    // live here and were previously never touched by this call at all.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(chatMessagesKey(routingId));
    }
    resetChatScript(routingId);
    return delay(undefined, 600);
  }
}

// Which implementation the app uses is decided here and nowhere else, per LLD
// Section 6.2. Set NEXT_PUBLIC_API_BASE_URL to the Python service (e.g.
// http://127.0.0.1:8000) to run against the real backend; leave it unset and
// the app keeps running on mock fixtures, so the UI still works offline and
// the tests stay hermetic.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

export const usingMockApi = !apiBaseUrl;

export const apiClient: ApiClient = apiBaseUrl
  ? new HttpApiClient(apiBaseUrl)
  : new MockApiClient();
