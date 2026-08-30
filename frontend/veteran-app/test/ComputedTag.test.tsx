import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComputedTag } from "@/components/shared/ComputedTag";

describe("ComputedTag", () => {
  it('defaults to the label "Computed"', () => {
    render(<ComputedTag />);
    expect(screen.getByText("Computed")).toBeInTheDocument();
  });

  it("accepts a custom label for deterministic content like system-extracted fields", () => {
    render(<ComputedTag label="System-extracted" />);
    expect(screen.getByText("System-extracted")).toBeInTheDocument();
    expect(screen.queryByText("Computed")).not.toBeInTheDocument();
  });
});
