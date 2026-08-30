import type { Claim, ChatMessage, RoutingId, VsoInfo } from "@/lib/api/types";
import type { ApiClient } from "@/lib/api/client";

/**
 * Real backend implementation of ApiClient, talking to the Python service
 * (src/api/app_routes.py). It fulfils exactly the same interface as the mock,
 * so no component knows or cares which one it is holding.
 *
 * The backend creates a claim on first contact with a routing id, so there is
 * no separate "register" call -- the id the session store minted is enough.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}/api/app${path}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(this.url(path), {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init?.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...init?.headers,
        },
      });

      if (!response.ok) {
        // Surface the backend's own message; it is written for a human.
        const detail = await response
          .json()
          .then((body) => body?.detail)
          .catch(() => null);
        throw new Error(detail ?? `Request failed (${response.status})`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The server took too long to respond. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getClaim(routingId: RoutingId): Promise<Claim> {
    return this.request<Claim>(`/claims/${encodeURIComponent(routingId)}`);
  }

  async sendChatMessage(routingId: RoutingId, text: string): Promise<ChatMessage[]> {
    const body = await this.request<{ messages: ChatMessage[] }>(
      `/claims/${encodeURIComponent(routingId)}/chat`,
      { method: "POST", body: JSON.stringify({ text }) },
    );
    return body.messages;
  }

  /** Not on the mock: uploads a document into the conversation. */
  async uploadDocument(routingId: RoutingId, file: File): Promise<ChatMessage[]> {
    const form = new FormData();
    form.append("file", file);
    const body = await this.request<{ messages: ChatMessage[] }>(
      `/claims/${encodeURIComponent(routingId)}/documents`,
      { method: "POST", body: form },
    );
    return body.messages;
  }

  /** Not on the mock: the full transcript, for resuming a conversation. */
  async getMessages(routingId: RoutingId): Promise<ChatMessage[]> {
    const body = await this.request<{ messages: ChatMessage[] }>(
      `/claims/${encodeURIComponent(routingId)}/messages`,
    );
    return body.messages;
  }

  async confirmClaimDraft(routingId: RoutingId): Promise<{ vso: VsoInfo }> {
    return this.request<{ vso: VsoInfo }>(
      `/claims/${encodeURIComponent(routingId)}/confirm`,
      { method: "POST" },
    );
  }

  async deleteMyData(routingId: RoutingId): Promise<void> {
    await this.request<{ deleted: boolean }>(
      `/claims/${encodeURIComponent(routingId)}`,
      { method: "DELETE" },
    );
  }
}
