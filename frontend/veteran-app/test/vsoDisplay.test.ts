import { describe, it, expect } from "vitest";
import {
  DEFAULT_INBOX_FILTERS,
  defaultEvidenceRequestText,
  formatRelativeTime,
  isFiltersDefault,
  toggleSelection,
  veteranInitials,
  type InboxFilterState,
} from "@/components/vso/vsoDisplay";

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");

  it("returns 'just now' for a timestamp under a minute old", () => {
    const iso = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("just now");
  });

  it("returns 'just now' for a timestamp slightly in the future (clock skew)", () => {
    const iso = new Date(now.getTime() + 5_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("just now");
  });

  it("formats minutes ago under an hour", () => {
    const iso = new Date(now.getTime() - 12 * 60_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("12m ago");
  });

  it("formats hours ago under a day", () => {
    const iso = new Date(now.getTime() - 5 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("5h ago");
  });

  it("formats days ago under the 30-day cutoff", () => {
    const iso = new Date(now.getTime() - 4 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("4d ago");
  });

  it("falls back to a short absolute date at or past the 30-day cutoff", () => {
    const iso = new Date(now.getTime() - 40 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe(
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso)),
    );
  });

  it("returns the raw string for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
  });
});

describe("veteranInitials", () => {
  it("takes the first letter of the first and last name for a two-word name", () => {
    expect(veteranInitials("John Smith")).toBe("JS");
  });

  it("takes the first and last token for a name with a middle name", () => {
    expect(veteranInitials("Mary Jane Watson")).toBe("MW");
  });

  it("takes the first two letters of a single-word name", () => {
    expect(veteranInitials("Cher")).toBe("CH");
  });

  it("uppercases lowercase input", () => {
    expect(veteranInitials("john smith")).toBe("JS");
  });

  it("returns '?' for an empty string", () => {
    expect(veteranInitials("")).toBe("?");
  });

  it("returns '?' for a whitespace-only string", () => {
    expect(veteranInitials("   ")).toBe("?");
  });

  it("collapses repeated internal whitespace", () => {
    expect(veteranInitials("John   Smith")).toBe("JS");
  });
});

describe("isFiltersDefault", () => {
  it("is true for the default filter state", () => {
    expect(isFiltersDefault(DEFAULT_INBOX_FILTERS)).toBe(true);
  });

  it("is true when search is only whitespace", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, search: "   " };
    expect(isFiltersDefault(filters)).toBe(true);
  });

  it("is false when search has a real query", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, search: "smith" };
    expect(isFiltersDefault(filters)).toBe(false);
  });

  it("is false when the sort key isn't the default", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, sortKey: "readiness" };
    expect(isFiltersDefault(filters)).toBe(false);
  });

  it("is false when the status filter isn't 'all'", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, statusFilter: "draft" };
    expect(isFiltersDefault(filters)).toBe(false);
  });

  it("is false when 'has blockers only' is checked", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, onlyBlockers: true };
    expect(isFiltersDefault(filters)).toBe(false);
  });

  it("is false when a lane view has isolated one lane", () => {
    const filters: InboxFilterState = { ...DEFAULT_INBOX_FILTERS, laneFilter: "needs_you" };
    expect(isFiltersDefault(filters)).toBe(false);
  });
});

describe("defaultEvidenceRequestText", () => {
  it("names the single missing item when there is exactly one", () => {
    expect(defaultEvidenceRequestText(["DD-214 (discharge document)"])).toBe(
      "Please provide: DD-214 (discharge document).",
    );
  });

  it("joins two missing items with 'and', no oxford comma needed", () => {
    expect(defaultEvidenceRequestText(["DD-214", "Service treatment records"])).toBe(
      "Please provide: DD-214, and Service treatment records.",
    );
  });

  it("joins three or more missing items as a comma list plus 'and' before the last", () => {
    expect(defaultEvidenceRequestText(["DD-214", "Service treatment records", "Nexus letter"])).toBe(
      "Please provide: DD-214, Service treatment records, and Nexus letter.",
    );
  });

  it("falls back to a status-check message when nothing specific is missing", () => {
    const text = defaultEvidenceRequestText([]);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Please provide:/);
  });

  it("does not mutate the input array", () => {
    const labels = ["DD-214", "Nexus letter"];
    defaultEvidenceRequestText(labels);
    expect(labels).toEqual(["DD-214", "Nexus letter"]);
  });
});

describe("toggleSelection", () => {
  it("adds an id that isn't already selected", () => {
    const next = toggleSelection(new Set(), "case-1");
    expect(next.has("case-1")).toBe(true);
    expect(next.size).toBe(1);
  });

  it("removes an id that is already selected", () => {
    const next = toggleSelection(new Set(["case-1", "case-2"]), "case-1");
    expect(next.has("case-1")).toBe(false);
    expect(next.has("case-2")).toBe(true);
    expect(next.size).toBe(1);
  });

  it("does not mutate the input set", () => {
    const original = new Set(["case-1"]);
    toggleSelection(original, "case-2");
    expect(original.has("case-2")).toBe(false);
    expect(original.size).toBe(1);
  });

  it("returns a new Set instance, not the same reference", () => {
    const original = new Set<string>();
    const next = toggleSelection(original, "case-1");
    expect(next).not.toBe(original);
  });
});
