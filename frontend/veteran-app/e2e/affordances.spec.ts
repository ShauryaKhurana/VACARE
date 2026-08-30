import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * The upload card and the quick-reply buttons describe the *current*
 * question, and the server re-sends them on every turn that question stays
 * open. Appending them blindly stacked identical cards: one upload gave two
 * prompts, two uploads gave three, and the thread filled with duplicates.
 *
 * (Making their ids turn-unique silenced React's duplicate-key warning but
 * legitimised the stacking, which is why this is asserted on screen rather
 * than on the console.)
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");
const UPLOAD_PROMPT = /You can upload a photo or PDF/i;

test("an upload card is replaced, never stacked", async ({ page }) => {
  await page.goto("/talk");
  await expect(page.getByText(UPLOAD_PROMPT)).toHaveCount(1, { timeout: 30_000 });

  // Upload while the opening question is still unanswered, so it stays open
  // and its card is re-sent on the next turn.
  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(UPLOAD_PROMPT)).toHaveCount(1);

  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await page.waitForTimeout(5000);
  await expect(page.getByText(UPLOAD_PROMPT)).toHaveCount(1);

  // Two file inputs total: the composer's paperclip and the single card.
  await expect(page.locator('input[type="file"]')).toHaveCount(2);
});
