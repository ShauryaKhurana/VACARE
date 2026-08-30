import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickReplies } from "@/components/chat/QuickReplies";

const OPTIONS = ["Done uploading", "Skip for now"];

describe("QuickReplies", () => {
  it("renders one button per choice", () => {
    render(<QuickReplies options={OPTIONS} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Done uploading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
  });

  it("sends the chosen answer", () => {
    const onSelect = vi.fn();
    render(<QuickReplies options={OPTIONS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Done uploading" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("Done uploading");
  });

  it("cannot be double-sent while the answer is in flight", () => {
    const onSelect = vi.fn();
    render(<QuickReplies options={OPTIONS} onSelect={onSelect} />);
    const chosen = screen.getByRole("button", { name: "Done uploading" });
    fireEvent.click(chosen);
    fireEvent.click(chosen);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there are no choices", () => {
    const { container } = render(<QuickReplies options={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
