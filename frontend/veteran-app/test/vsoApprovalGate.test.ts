import { describe, it, expect } from "vitest";
import { filingCheckBlockers } from "@/lib/api/vso/client";
import type { FilingCheckItem } from "@/lib/api/vso/types";

function check(overrides: Partial<FilingCheckItem>): FilingCheckItem {
  return { label: "Check", ok: true, detail: "", optional: false, missing_items: [], ...overrides };
}

describe("filingCheckBlockers", () => {
  it("returns no blockers when every check is ok", () => {
    const checks = [check({ label: "A" }), check({ label: "B" }), check({ label: "C" })];
    expect(filingCheckBlockers(checks)).toEqual([]);
  });

  it("skips a failing check that is marked optional", () => {
    const checks = [check({ label: "Back-pay start date (21-0966)", ok: false, optional: true })];
    expect(filingCheckBlockers(checks)).toEqual([]);
  });

  it("expands 'Required evidence' into its individual missing items instead of the generic label", () => {
    const checks = [
      check({
        label: "Required evidence",
        ok: false,
        missing_items: ["DD-214 (discharge document)", "Current medical records (Tinnitus)"],
      }),
    ];
    expect(filingCheckBlockers(checks)).toEqual([
      "DD-214 (discharge document)",
      "Current medical records (Tinnitus)",
    ]);
  });

  it("uses the generic label for any other failing, non-optional check", () => {
    const checks = [check({ label: "VSO representation (21-22)", ok: false })];
    expect(filingCheckBlockers(checks)).toEqual(["VSO representation (21-22)"]);
  });

  it("combines blockers across multiple failing checks in order", () => {
    const checks = [
      check({ label: "Back-pay start date (21-0966)", ok: false }),
      check({ label: "VSO representation (21-22)", ok: true }),
      check({ label: "Required evidence", ok: false, missing_items: ["DD-214 (discharge document)"] }),
    ];
    expect(filingCheckBlockers(checks)).toEqual([
      "Back-pay start date (21-0966)",
      "DD-214 (discharge document)",
    ]);
  });
});
