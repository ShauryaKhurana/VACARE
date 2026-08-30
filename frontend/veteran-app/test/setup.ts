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

// Same gap, same fix, for Element.scrollTo -- CaseConversation's own
// scroll-region autoscroll now calls el.scrollTo() directly (rather than
// bottomRef.scrollIntoView(), which used to bubble the scroll up through
// every ancestor scroll container, including the page-level one) so it only
// ever scrolls its own message list. jsdom doesn't implement it either.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});
