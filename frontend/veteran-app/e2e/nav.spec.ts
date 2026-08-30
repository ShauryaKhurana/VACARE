import { test, expect } from "@playwright/test";

/**
 * All three tabs are available once the veteran has started talking. "My
 * claim" and "You" used to be held back until a claim had been sent, which
 * left no way to reach either screen — or the 526EZ download on them.
 *
 * The nav as a whole still stays out of the way on the very first screen,
 * before anything has been said.
 */
test("Talk, My claim and You are all in the nav once the chat has started", async ({ page }) => {
  await page.goto("/talk");
  await expect(page.getByText(/What hurts or bothers you/i).first()).toBeVisible({
    timeout: 30_000,
  });

  const composer = page.locator("textarea:visible").first();
  await composer.fill("My ears ring.");
  await composer.press("Enter");

  for (const label of ["Talk", "My claim", "You"]) {
    await expect(
      page.getByRole("link", { name: label, exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });
  }
});
