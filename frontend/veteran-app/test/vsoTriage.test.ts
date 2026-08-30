import { describe, it, expect } from "vitest";
import { deriveTriageLane, hasOpenInfoRequest } from "@/lib/api/vso/client";
import type { VsoCaseTask } from "@/lib/api/vso/types";

describe("deriveTriageLane", () => {
  it("buckets a case with blockers and no activity into needs_you", () => {
    const lane = deriveTriageLane({
      status: "ready_for_vso",
      vso_approved: false,
      blockers: ["Missing required document: DD-214"],
      waitingOnVeteran: false,
    });
    expect(lane).toBe("needs_you");
  });

  it("buckets a case with an open VSO information request into waiting_on_veteran", () => {
    const lane = deriveTriageLane({
      status: "in_vso_review",
      vso_approved: false,
      blockers: [],
      waitingOnVeteran: true,
    });
    expect(lane).toBe("waiting_on_veteran");
  });

  it("buckets a case with no blockers and nothing outstanding into ready_to_file", () => {
    const lane = deriveTriageLane({
      status: "in_vso_review",
      vso_approved: false,
      blockers: [],
      waitingOnVeteran: false,
    });
    expect(lane).toBe("ready_to_file");
  });

  it("buckets an approved case into with_va even if it still has blockers", () => {
    const lane = deriveTriageLane({
      status: "in_vso_review",
      vso_approved: true,
      blockers: ["stale blocker that hasn't been cleared out of the checklist"],
      waitingOnVeteran: false,
    });
    expect(lane).toBe("with_va");
  });

  it("buckets submitted and decided cases into with_va regardless of approval flag", () => {
    expect(
      deriveTriageLane({ status: "submitted", vso_approved: false, blockers: [], waitingOnVeteran: false }),
    ).toBe("with_va");
    expect(
      deriveTriageLane({ status: "decided", vso_approved: false, blockers: [], waitingOnVeteran: false }),
    ).toBe("with_va");
  });

  it("checks waiting_on_veteran before ready_to_file, so a cleared checklist with an open request still waits", () => {
    const lane = deriveTriageLane({
      status: "in_vso_review",
      vso_approved: false,
      blockers: [],
      waitingOnVeteran: true,
    });
    expect(lane).toBe("waiting_on_veteran");
  });
});

describe("hasOpenInfoRequest", () => {
  function task(overrides: Partial<VsoCaseTask>): VsoCaseTask {
    return {
      id: "t1",
      name: "VSO requested information",
      detail: null,
      required: true,
      owner: "veteran",
      status: "open",
      condition_id: null,
      ...overrides,
    };
  }

  it("is true when an open 'VSO requested information' task exists", () => {
    expect(hasOpenInfoRequest([task({})])).toBe(true);
  });

  it("is false once that task is done", () => {
    expect(hasOpenInfoRequest([task({ status: "done" })])).toBe(false);
  });

  it("is false for an unrelated open task", () => {
    expect(hasOpenInfoRequest([task({ name: "Obtain: DD-214" })])).toBe(false);
  });

  it("is false for an empty task list", () => {
    expect(hasOpenInfoRequest([])).toBe(false);
  });
});
