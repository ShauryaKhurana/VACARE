import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Finishing the dig has to lead somewhere. The client used to infer "the dig
 * is over" from a turn being all text with no card, which the real
 * conversation breaks -- its last turn carries the eligibility card. So the
 * handoff to Review never appeared, the claim could never be sent, and
 * "My claim" and "You" (which require a submission) stayed hidden along with
 * the 526EZ download.
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");

test.describe.configure({ timeout: 240_000 });

test("the dig ends with a way through to review, submission and the form", async ({ page }) => {
  await page.goto("/talk");
  const composer = () => page.locator("textarea:visible").first();

  /** Sends a message and waits for it to appear, rather than for a guess. */
  async function send(text: string) {
    await expect(composer()).toBeEditable({ timeout: 30_000 });
    await composer().fill(text);
    await composer().press("Enter");
    // Scoped to the message log: the same string also sits in the composer
    // and, for the address, on a suggestion button.
    await expect(
      page.getByRole("log", { name: "Your message" }).filter({ hasText: text }).first(),
    ).toBeVisible({ timeout: 60_000 });
    // Wait for the turn to land before doing anything else, or the next
    // action races the one still in flight.
    await expect(page.getByRole("status", { name: /typing/i })).toBeHidden({
      timeout: 90_000,
    });
  }

  // Wait for the opening question: typing before it lands loses the message.
  await expect(page.getByText(/What hurts or bothers you/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await send("Ears ring since an IED blast in Kandahar in 2011.");

  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 120_000 });

  for (const answer of [
    "310-800-5600, d@e.com",
    "3114 Elm Street, Tucson, AZ 85701",
    "30%",
    "Something new",
    "Done uploading",
    "Skip for now",
    "Skip for now",
  ]) {
    await send(answer);
  }

  // The handoff the veteran needs in order to get anywhere.
  const review = page.getByRole("link", { name: /Continue to Review/i });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await review.click();

  // The draft form is downloadable before it goes to a human.
  await expect(page.getByRole("link", { name: /download my draft form/i })).toBeVisible({
    timeout: 30_000,
  });

  // Sending it goes through a simulated identity step, as VA.gov does.
  await page.getByRole("button", { name: /Confirm & send to my VSO/i }).click();
  await expect(
    page.getByRole("heading", { name: /Sign in to send your claim/i }),
  ).toBeVisible({ timeout: 30_000 });
  await page.locator("#signin-email").fill("dana@example.com");
  await page.getByRole("button", { name: /Sign in & send to my VSO/i }).click();

  // The claim is sent: the VSO introduction is the confirmation.
  await expect(page.getByRole("heading", { name: /You're connected/i })).toBeVisible({
    timeout: 60_000,
  });

  // And only now do the returning-veteran surfaces exist. They live in the
  // main layout, so the connect screen itself has no side nav.
  await page.goto("/claim");
  await expect(page.getByRole("link", { name: /My claim/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: /You/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /download my draft form/i })).toBeVisible({
    timeout: 30_000,
  });
});
