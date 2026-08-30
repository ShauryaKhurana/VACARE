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
  { path: "/vso/signin", expectedText: /sign in as a vso representative/i },
  // Unauthenticated: the VSO layout gates every /vso/* route behind
  // signin (app/(vso)/layout.tsx), redirecting to /vso/signin before
  // anything else renders. Asserting that redirect -- rather than seeding
  // sign-in state for these two -- is deliberate: it's the same nav-gating
  // check the plan's own verification section asks for, and it keeps this
  // loop's shape (one goto, one assertion) identical to every other route
  // here. The authenticated inbox and case-detail renders are covered
  // separately below, where sign-in state is seeded first.
  { path: "/vso", expectedText: /sign in as a vso representative/i },
  { path: "/vso/cases/1b7f4e9a2d63", expectedText: /sign in as a vso representative/i },
];

for (const { path, expectedText } of ROUTES) {
  test(`${path} renders without a page error`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto(path);
    // .and(page.locator(":visible")) matters now that a Desktop project
    // exists alongside the mobile ones: ChatThread renders its greeting
    // twice for responsive reasons (once inside a `md:hidden` message list,
    // once inside a `hidden md:flex` desktop hero), so a bare `.first()`
    // picks whichever copy is first in the DOM regardless of which one is
    // actually visible at the current viewport -- on mobile that's the
    // visible one by luck, on desktop it isn't. Intersecting with `:visible`
    // keeps this assertion viewport-agnostic without touching ChatThread.
    await expect(page.getByText(expectedText).and(page.locator(":visible")).first()).toBeVisible({
      timeout: 15_000,
    });

    expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
  });
}

/** Seeds vsoStore's persisted identity (persist key `vacare-vso`, the same
 * shape lib/store/vsoStore.ts writes) before any page script runs, so these
 * two tests exercise the VSO surfaces as a signed-in rep would see them
 * instead of bouncing off the signin redirect like the unauthenticated
 * ROUTES entries above. */
async function signInAsVso(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "vacare-vso",
      JSON.stringify({
        state: {
          identity: { name: "E2E Rep", organization: "Test VSO Org", accreditationId: "A00000" },
          lastSeenMessageIds: {},
        },
        version: 0,
      }),
    );
  });
}

test("/vso renders the triage-lane inbox without a page error, once signed in", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await signInAsVso(page);
  await page.goto("/vso");
  await expect(page.getByRole("heading", { name: "Caseload" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Needs you")).toBeVisible();

  expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
});

test("/vso/cases/[caseId] renders the case review surface without a page error, once signed in", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await signInAsVso(page);
  await page.goto("/vso/cases/1b7f4e9a2d63");
  await expect(page.getByRole("heading", { name: "Review findings" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /approve to file/i })).toBeVisible();

  expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
});
