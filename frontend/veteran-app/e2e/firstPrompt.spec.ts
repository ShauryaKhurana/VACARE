import { test, expect } from "@playwright/test";

/**
 * Opening the chat used to POST an empty message to provoke the first
 * question. That ran a full model call on an empty string — around eleven
 * seconds of blank thread before anything appeared — and at some steps the
 * blank was read as a decision to skip.
 *
 * The opening question already exists server-side, so it is read back.
 */

test("the first question is on screen almost immediately", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/app")) {
      calls.push(`${request.method()} ${request.url().split("/api/app")[1]}`);
    }
  });

  const started = Date.now();
  await page.goto("/talk");
  await expect(page.getByText(/What hurts or bothers you/i).first()).toBeVisible({
    timeout: 15_000,
  });
  const elapsed = Date.now() - started;

  expect(elapsed, `took ${elapsed}ms to show the first question`).toBeLessThan(5000);
  // Nothing is posted to open the conversation.
  expect(calls.some((call) => call.startsWith("POST"))).toBe(false);
});
