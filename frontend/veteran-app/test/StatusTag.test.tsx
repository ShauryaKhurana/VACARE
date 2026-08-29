import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusTag } from "@/components/shared/StatusTag";

describe("StatusTag", () => {
  it("always renders a text label alongside its icon, never color alone", () => {
    render(<StatusTag variant="success" label="Granted · 30%" />);
    expect(screen.getByText("Granted · 30%")).toBeInTheDocument();
  });

  it.each([
    ["success", "border-success/30"],
    ["warning", "border-warning/30"],
    ["danger", "border-danger/30"],
    ["pending", "border-text-secondary/30"],
  ] as const)("applies the %s variant's reserved color classes", (variant, expectedClass) => {
    render(<StatusTag variant={variant} label="status" />);
    expect(screen.getByText("status")).toHaveClass(expectedClass);
  });
});
