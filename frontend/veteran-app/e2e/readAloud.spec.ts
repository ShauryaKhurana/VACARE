import { test, expect } from "@playwright/test";

/**
 * The unit tests install a fake speechSynthesis, which proves the wiring but
 * not that a real browser accepts it. This runs against the live stack and
 * records what the page actually hands to the speech engine.
 *
 * It records rather than listens: headless Chromium exposes speechSynthesis
 * but has no audio device behind it, so asserting on sound is impossible.
 * What matters is that the assistant's text reaches the engine, once, and
 * that the veteran's own words never do.
 */
test("reads the assistant's messages aloud, and only those", async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    // Replace the engine before any app code runs, so nothing is missed.
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: () => {},
        speak: (u: SpeechSynthesisUtterance) => spoken.push(u.text),
      },
    });
  });

  await page.goto("/talk");

  // Mobile and desktop composers both render the control; only one is on
  // screen at this viewport, so match on visibility rather than order.
  const toggle = page.getByLabel("Read messages aloud").locator("visible=true").first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(
    page.getByLabel("Turn off reading messages aloud").locator("visible=true").first(),
  ).toBeVisible();

  const message = "Ringing in my ears since a convoy blast in 2012.";
  await page.locator("textarea:visible").first().fill(message);
  await page.getByLabel("Send message").locator("visible=true").first().click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length), {
      timeout: 90_000,
    })
    .toBeGreaterThan(0);

  const spoken = await page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken,
  );

  // The veteran does not need their own sentence read back to them.
  expect(spoken.join(" ")).not.toContain("Ringing in my ears");

  // And an em dash should have been softened into a pause, not spoken.
  expect(spoken.join(" ")).not.toContain("—");
});

test("switching read-aloud off stops the assistant mid-sentence", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cancels: number }).__cancels = 0;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: () => {
          (window as unknown as { __cancels: number }).__cancels += 1;
        },
        speak: () => {},
      },
    });
  });

  await page.goto("/talk");
  await page.getByLabel("Read messages aloud").locator("visible=true").first().click();
  await page.getByLabel("Turn off reading messages aloud").locator("visible=true").first().click();

  const cancels = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
  expect(cancels).toBeGreaterThan(0);
});
