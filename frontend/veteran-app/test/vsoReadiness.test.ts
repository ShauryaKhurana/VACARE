import { describe, it, expect } from "vitest";
import { computeReadinessScore } from "@/lib/api/vso/mock/caseload";
import { readinessBreakdown } from "@/components/vso/vsoDisplay";
import type { ChecklistItemResponse } from "@/lib/api/vso/types";

function item(required: boolean, satisfied: boolean): ChecklistItemResponse {
  return { evidence_type: "other", label: "x", required, satisfied, condition_name: null };
}

describe("computeReadinessScore", () => {
  it("returns 100 when every checklist item is satisfied and there are no warnings", () => {
    const checklist = [item(true, true), item(false, true)];
    expect(computeReadinessScore(checklist, 0)).toBe(100);
  });

  it("subtracts 20 per missing required item, 5 per missing suggested item, 5 per warning", () => {
    const checklist = [item(true, false), item(true, true), item(false, false)];
    // 1 required missing (-20), 1 suggested missing (-5), 2 warnings (-10) = 100 - 35 = 65
    expect(computeReadinessScore(checklist, 2)).toBe(65);
  });

  it("clamps at 0 instead of going negative", () => {
    const checklist = [item(true, false), item(true, false), item(true, false), item(true, false), item(true, false), item(true, false)];
    expect(computeReadinessScore(checklist, 10)).toBe(0);
  });

  it("clamps at 100 instead of exceeding it", () => {
    expect(computeReadinessScore([], 0)).toBe(100);
  });
});

describe("readinessBreakdown", () => {
  it("spells out the exact arithmetic behind the score, never just the bare number", () => {
    const text = readinessBreakdown(1, 2, 3, 55);
    expect(text).toBe("100 − (1×20 required) − (2×5 suggested) − (3×5 warnings) = 55");
  });
});
