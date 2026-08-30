import { describe, it, expect } from "vitest";
import { vsoApiClient, VsoApprovalBlockedError, filingCheckBlockers } from "@/lib/api/vso/client";

describe("mock vsoApiClient", () => {
  it("listQueue returns the full mock caseload with queue-row shape", async () => {
    const queue = await vsoApiClient.listQueue();
    expect(queue.length).toBeGreaterThanOrEqual(10);
    for (const item of queue) {
      expect(item).toMatchObject({
        claim_id: expect.any(String),
        veteran_name: expect.any(String),
        status: expect.any(String),
        created_on: expect.any(String),
        conditions: expect.any(String),
      });
    }
  });

  it("getCase returns the matching case for a known id", async () => {
    const vsoCase = await vsoApiClient.getCase("1b7f4e9a2d63");
    expect(vsoCase.veteran.last_name).toBe("Nguyen");
  });

  it("getCase rejects for an unknown case id", async () => {
    await expect(vsoApiClient.getCase("does-not-exist")).rejects.toThrow(/not found/i);
  });

  it("getFilingChecks returns the three-item approve-to-file gate", async () => {
    const checks = await vsoApiClient.getFilingChecks("4f2a91c7e6b3");
    expect(checks.map((c) => c.label)).toEqual([
      "Back-pay start date (21-0966)",
      "VSO representation (21-22)",
      "Required evidence",
    ]);
  });

  it("requestInfo files a formal follow-up task, opens the case, and posts a VSO message", async () => {
    const caseId = "7a3f9c1e6b45";
    const before = await vsoApiClient.getCase(caseId);
    const openTasksBefore = before.tasks.filter((t) => t.status === "open").length;

    const message = await vsoApiClient.requestInfo(caseId, {
      reviewer_name: "Test Rep",
      request_text: "Please send your latest imaging.",
    });

    expect(message.author).toBe("vso");
    expect(message.body).toBe("Please send your latest imaging.");

    const after = await vsoApiClient.getCase(caseId);
    expect(after.status).toBe("in_vso_review");
    const openTasksAfter = after.tasks.filter((t) => t.status === "open");
    expect(openTasksAfter.length).toBe(openTasksBefore + 1);
    expect(openTasksAfter.some((t) => t.name === "VSO requested information")).toBe(true);

    const messages = await vsoApiClient.getMessages(caseId);
    expect(messages.at(-1)?.body).toBe("Please send your latest imaging.");
  });

  it("approveToFile rejects with the exact blocker list when required evidence is missing", async () => {
    const caseId = "4f2a91c7e6b3"; // James Whitfield -- missing DD-214, blocks approval
    const checks = await vsoApiClient.getFilingChecks(caseId);
    const expectedBlockers = filingCheckBlockers(checks);
    expect(expectedBlockers.length).toBeGreaterThan(0);

    let caught: unknown;
    try {
      await vsoApiClient.approveToFile(caseId, { reviewer_name: "Test Rep", note: "" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VsoApprovalBlockedError);
    expect((caught as VsoApprovalBlockedError).blockers).toEqual(expectedBlockers);
  });

  it("approveToFile succeeds and flips vso_approved when every filing check passes", async () => {
    const caseId = "3e7c9a5f2b68"; // Jennifer Diaz -- checklist complete, no blockers
    const summary = await vsoApiClient.approveToFile(caseId, {
      reviewer_name: "Test Rep",
      note: "Looks complete.",
    });

    expect(summary.case_id).toBe(caseId);

    const after = await vsoApiClient.getCase(caseId);
    expect(after.vso_approved).toBe(true);

    const messages = await vsoApiClient.getMessages(caseId);
    expect(messages.at(-1)?.body).toContain("Looks complete.");
  });

  it("getPacket includes the case id and readiness in the packet text", async () => {
    const { packet, case_id } = await vsoApiClient.getPacket("1b7f4e9a2d63");
    expect(case_id).toBe("1b7f4e9a2d63");
    expect(packet).toContain("1b7f4e9a2d63");
    expect(packet).toMatch(/Readiness: \d+\/100/);
  });
});
