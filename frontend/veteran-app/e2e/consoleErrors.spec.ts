import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * React logs "Encountered two children with the same key" as a console error
 * and may then drop or duplicate a bubble. It appeared once the thread began
 * merging localStorage-restored messages with server turns, and because the
 * trailing upload/quick-reply cards carried a slot-only id that repeated on
 * every turn the question stayed open.
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");

test("a multi-turn conversation logs no duplicate-key errors", async ({ page }) => {
  const keyErrors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && /same key|unique/i.test(text)) {
      keyErrors.push(text);
    }
  });

  await page.goto("/talk");
  const composer = page.getByRole("textbox").first();

  // Several turns, including one the backend will not accept as an answer,
  // so the same question stays open and re-sends its trailing card.
  for (const text of ["hello", "my ears ring since 2011", "and my back hurts"]) {
    await composer.fill(text);
    await composer.press("Enter");
    await page.waitForTimeout(1500);
  }

  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await page.waitForTimeout(3000);

  // Reload: this is what makes the thread merge stored messages with fresh
  // server turns, the exact condition that produced the duplicates.
  await page.reload();
  await page.waitForTimeout(1500);
  await composer.fill("anything else");
  await composer.press("Enter");
  await page.waitForTimeout(1500);

  expect(keyErrors, `duplicate-key errors:\n${keyErrors.join("\n")}`).toHaveLength(0);
});
