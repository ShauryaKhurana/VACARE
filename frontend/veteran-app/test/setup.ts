import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement scrollIntoView -- several components (ChatThread,
// CaseConversation) call it on autoscroll refs, which throws under jsdom
// with no stub in place. A no-op is all any test needs; nothing here
// asserts on scroll position.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
