import { describe, it, expect } from "vitest";
import { HttpApiClient } from "@/lib/api/http";

describe("HttpApiClient URL joining", () => {
  it("treats '/' as same-origin so Docker can proxy /api to Python", () => {
    const client = new HttpApiClient("/");
    expect(client.formDownloadUrl("route-abc")).toBe("/api/app/claims/route-abc/526ez");
  });
});
