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
