import { test, expect } from "@playwright/test";

/**
 * A smoke pass, not a full per-wireframe e2e suite: confirms each core
 * route boots against the mock fixtures without a thrown page error.
 * Deeper e2e coverage (interaction flows, axe-core accessibility audits
 * per route) is follow-up work, not attempted here.
 */
const ROUTES: { path: string; expectedText: string | RegExp }[] = [
  { path: "/welcome", expectedText: /free guide/i },
  { path: "/talk", expectedText: /help you get your va claim ready/i },
  { path: "/claim?fixture=development", expectedText: /your claim is being reviewed/i },
  { path: "/claim/decision?fixture=partial", expectedText: /combined rating/i },
  { path: "/you", expectedText: /what we keep|routing identifier|we keep only/i },
];

for (const { path, expectedText } of ROUTES) {
  test(`${path} renders without a page error`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto(path);
    await expect(page.getByText(expectedText).first()).toBeVisible({ timeout: 15_000 });

    expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
  });
}
