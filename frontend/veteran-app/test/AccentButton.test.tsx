import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccentButton } from "@/components/shared/AccentButton";

describe("AccentButton", () => {
  it("renders its children as a button", () => {
    render(<AccentButton>Confirm & send to my VSO</AccentButton>);
    expect(screen.getByRole("button", { name: /confirm & send to my vso/i })).toBeInTheDocument();
  });

  it("applies the control radius so it matches the design tokens", () => {
    render(<AccentButton>Continue</AccentButton>);
    expect(screen.getByRole("button")).toHaveClass("rounded-control");
  });

  it("respects the disabled prop", () => {
    render(<AccentButton disabled>Continue</AccentButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
