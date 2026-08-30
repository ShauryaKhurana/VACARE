import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * "Start over" must actually clear the conversation.
 *
 * Two things broke it. The control stayed disabled because attaching a
 * document from the composer never advanced the dig's step count, so the
 * veteran could not press it at all. And deleteMyData only deleted the claim
 * server-side: the mock client had always wiped the persisted thread too, so
 * the HTTP client leaving it behind meant the old conversation came straight
 * back and the button looked inert.
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");

test("start over clears the conversation and it stays cleared", async ({ page }) => {
  await page.goto("/talk");

  // Uploading is enough to move the dig past its first step.
  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 60_000 });

  const startOver = page.getByRole("button", { name: /^start over$/i });
  await expect(startOver).toBeEnabled({ timeout: 15_000 });
  await startOver.click();

  // Confirm in the dialog that opens.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /start over|delete|confirm|yes/i }).last().click();

  // The parsed DD-214 details must be gone from the thread.
  await expect(page.getByText(/Marcus Rivera/i)).toHaveCount(0, { timeout: 20_000 });

  // And must not return on reload -- that is where localStorage bit.
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByText(/Marcus Rivera/i)).toHaveCount(0);
});

test("start over still works after a reload", async ({ page }) => {
  // Progress lived only in React state, so a reload reset it to zero and
  // greyed the control out again -- with the DD-214 still confirmed on
  // screen. This is the sequence from the reported screenshot.
  await page.goto("/talk");
  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 60_000 });

  await page.reload();
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 30_000 });

  const startOver = page.getByRole("button", { name: /^start over$/i });
  await expect(startOver).toBeEnabled({ timeout: 15_000 });
  await startOver.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /start over|delete|confirm|yes/i }).last().click();

  await expect(page.getByText(/Marcus Rivera/i)).toHaveCount(0, { timeout: 20_000 });
});

test("a thread stored with stacked cards restores showing only one", async ({ page }) => {
  // A build before this fix persisted a card per turn, so returning veterans
  // have a stack sitting in localStorage. Seed exactly that and reload.
  const routingId = "route-seeded-stack-test";
  const stacked = [
    { id: "m1", type: "ai-text", text: "What hurts or bothers you?" },
    { id: "m2", type: "document-upload", prompt: "You can upload a photo or PDF here", documentType: "dd214" },
    { id: "m3", type: "veteran-text", text: "my ears ring" },
    { id: "m4", type: "document-upload", prompt: "You can upload a photo or PDF here", documentType: "dd214" },
    { id: "m5", type: "document-upload", prompt: "You can upload a photo or PDF here", documentType: "dd214" },
  ];

  await page.goto("/talk");
  await page.evaluate(
    ([id, messages]) => {
      window.localStorage.setItem(
        "veteran-app-session",
        JSON.stringify({ state: { routingId: id, onboardingComplete: true, claimSubmitted: false }, version: 0 }),
      );
      window.localStorage.setItem(`veteran-app-chat-${id}`, messages as string);
    },
    [routingId, JSON.stringify(stacked)] as const,
  );

  await page.reload();
  await page.waitForTimeout(2500);

  await expect(page.getByText(/You can upload a photo or PDF/i)).toHaveCount(1);
  // The conversation itself is untouched.
  await expect(page.getByText(/my ears ring/i).first()).toBeVisible();
});
