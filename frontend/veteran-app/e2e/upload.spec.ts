import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * The bug these exist for: a veteran could pick their DD-214, see the upload
 * acknowledged, and have nothing reach the server — the conversation then
 * asked for the same document again, forever.
 *
 * There were two dead paths, and both are covered here:
 *   1. the composer's "Attach a document" button, which announced
 *      "Attached: <name>" in the thread and dropped the file;
 *   2. the document card the dig offers, which ran a 900ms timer and
 *      resolved to a canned result.
 *
 * These run in a real browser on purpose: jsdom cannot serialise a multipart
 * upload faithfully, so only a browser proves the file actually leaves.
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");

async function openDigWithUploadOffered(page: import("@playwright/test").Page) {
  await page.goto("/talk");
  const composer = page.getByRole("textbox").first();
  await composer.fill("My ears ring since a blast in Kandahar in 2011.");
  await composer.press("Enter");
}

function trackUploads(page: import("@playwright/test").Page): string[] {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/documents")) {
      uploads.push(request.url());
    }
  });
  return uploads;
}

test.describe("document upload", () => {
  test("the composer's attach button sends the file to the backend", async ({ page }) => {
    const uploads = trackUploads(page);
    await openDigWithUploadOffered(page);

    const composerPicker = page.locator('input[type="file"]').last();
    await composerPicker.waitFor({ state: "attached", timeout: 30_000 });
    await composerPicker.setInputFiles(DD214);

    await expect.poll(() => uploads.length, { timeout: 45_000 }).toBeGreaterThan(0);
    // And the thread no longer shows the old "Attached: <name>" stand-in.
    await expect(page.getByText(/^Attached: /)).toHaveCount(0);
  });

  test("the card the dig offers sends the file to the backend", async ({ page }) => {
    const uploads = trackUploads(page);
    await openDigWithUploadOffered(page);

    const cardPicker = page.locator('input[type="file"]').first();
    await cardPicker.waitFor({ state: "attached", timeout: 30_000 });
    await cardPicker.setInputFiles(DD214);

    await expect.poll(() => uploads.length, { timeout: 45_000 }).toBeGreaterThan(0);
  });
});
