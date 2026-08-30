import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * The veteran had no way to see the form being prepared for them. The filled
 * 21-526EZ existed, but only on the server-rendered app and the VSO console —
 * not on the API the veteran app talks to.
 */

const DD214 = resolve(__dirname, "../../../tests/fixtures/dd214_scanned.pdf");

test("the veteran can download their filled draft 526EZ", async ({ page, request }) => {
  await page.goto("/talk");
  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 60_000 });

  await page.goto("/claim");
  const link = page.getByRole("link", { name: /download my draft form/i });
  await expect(link).toBeVisible({ timeout: 30_000 });

  // The link must actually serve a PDF, not a 404 page.
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await request.get(href as string);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("21-526EZ");

  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.byteLength).toBeGreaterThan(100_000);
});

test("the download is framed as a draft, not a filing", async ({ page }) => {
  await page.goto("/talk");
  await page.locator('input[type="file"]').last().setInputFiles(DD214);
  await expect(page.getByText(/Marcus Rivera/i).first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/claim");

  // Guardrail (requirements 4.4): we never imply this files anything.
  await expect(page.getByText(/doesn't send anything to the VA/i)).toBeVisible();
  await expect(page.getByText(/Everything you've told us is filled in/i)).toBeVisible();
});
