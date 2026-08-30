import { describe, it, expect, beforeEach } from "vitest";
import { useVsoStore } from "@/lib/store/vsoStore";

const BASE_FILTERS = {
  search: "",
  sortKey: "deadline" as const,
  statusFilter: "all" as const,
  onlyBlockers: false,
};

function resetStore() {
  useVsoStore.setState({
    identity: null,
    lastSeenMessageIds: {},
    filterPresets: [],
  });
}

describe("useVsoStore filter presets", () => {
  beforeEach(() => {
    resetStore();
  });

  it("savePreset appends a new preset with a generated id", () => {
    useVsoStore.getState().savePreset("Needs my attention", {
      ...BASE_FILTERS,
      onlyBlockers: true,
    });

    const presets = useVsoStore.getState().filterPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({
      name: "Needs my attention",
      onlyBlockers: true,
      statusFilter: "all",
      sortKey: "deadline",
    });
    expect(presets[0].id).toEqual(expect.any(String));
    expect(presets[0].id.length).toBeGreaterThan(0);
  });

  it("savePreset does not dedupe by name -- saving twice keeps both entries", () => {
    useVsoStore.getState().savePreset("My filters", BASE_FILTERS);
    useVsoStore.getState().savePreset("My filters", { ...BASE_FILTERS, onlyBlockers: true });

    expect(useVsoStore.getState().filterPresets).toHaveLength(2);
  });

  it("each saved preset gets a distinct id", () => {
    useVsoStore.getState().savePreset("A", BASE_FILTERS);
    useVsoStore.getState().savePreset("B", BASE_FILTERS);

    const [first, second] = useVsoStore.getState().filterPresets;
    expect(first.id).not.toEqual(second.id);
  });

  it("deletePreset removes only the matching preset", () => {
    useVsoStore.getState().savePreset("Keep me", BASE_FILTERS);
    useVsoStore.getState().savePreset("Delete me", BASE_FILTERS);
    const toDelete = useVsoStore.getState().filterPresets[1];

    useVsoStore.getState().deletePreset(toDelete.id);

    const remaining = useVsoStore.getState().filterPresets;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("Keep me");
  });

  it("deletePreset is a no-op for an id that doesn't exist", () => {
    useVsoStore.getState().savePreset("Only one", BASE_FILTERS);

    useVsoStore.getState().deletePreset("not-a-real-id");

    expect(useVsoStore.getState().filterPresets).toHaveLength(1);
  });

  it("savePreset stores a lane filter alongside the raw controls", () => {
    useVsoStore.getState().savePreset("Needs you only", {
      ...BASE_FILTERS,
      laneFilter: "needs_you",
    });

    expect(useVsoStore.getState().filterPresets[0]).toMatchObject({
      laneFilter: "needs_you",
    });
  });

  it("savePreset works without a lane filter, for callers matching the pre-views shape", () => {
    useVsoStore.getState().savePreset("Legacy preset", BASE_FILTERS);

    expect(useVsoStore.getState().filterPresets[0].laneFilter).toBeUndefined();
  });
});
