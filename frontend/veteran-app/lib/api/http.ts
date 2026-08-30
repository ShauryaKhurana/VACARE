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

/**
 * Turns an error response into one line a veteran can read.
 *
 * FastAPI returns `detail` as a string for our own errors but as an array of
 * objects for request-validation failures. Interpolating that straight into
 * an Error produced "[object Object]" on screen.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Something went wrong (${response.status}). Please try again.`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }

  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (entry as { msg?: unknown })?.msg)
      .filter((msg): msg is string => typeof msg === "string");
    if (messages.length > 0) return messages.join("; ");
  }

  return fallback;
}

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
        throw new Error(await readErrorMessage(response));
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
  async uploadDocument(
    routingId: RoutingId,
    file: File | Blob,
    filename: string,
  ): Promise<ChatMessage[]> {
    const form = new FormData();
    // The third argument matters: a Blob has no name of its own, and without
    // it the server receives the upload as "blob" with no extension to go on.
    form.append("file", file, filename);
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
