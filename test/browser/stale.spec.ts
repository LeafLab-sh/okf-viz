// T8: staleness is decided by the browser's clock when the file is opened,
// not when it was generated (SPEC §4.2).

import { expect, type Page } from "@playwright/test";
import { generateViewer } from "../../src/index.js";
import { openViewer, test } from "./harness.js";

const STALE_AFTER = "2026-06-01T12:00:00Z";
const { html } = generateViewer({
  name: "Stale",
  files: {
    "dated.md": `---\ntype: Reference\ntitle: Dated\nstale_after: ${STALE_AFTER}\n---\n\nBody.\n`,
    "date-only.md":
      "---\ntype: Reference\ntitle: Date only\nstale_after: 2020-01-01\n---\n\nBody.\n",
    "undated.md": "---\ntype: Reference\ntitle: Undated\n---\n\nBody.\n",
  },
});

const staleNodes = (page: Page) =>
  page.evaluate(() =>
    (window as any).okfViewer.cy.nodes(".stale").map((n: any) => n.data("concept")),
  );

const show = (page: Page, id: string) =>
  page.evaluate((conceptId) => (window as any).okfViewer.showDetail(conceptId), id);

test("the same file is fresh before the instant", async ({ page }) => {
  const opened = await openViewer(page, html, {
    via: "file",
    now: new Date("2026-06-01T11:59:59Z"),
  });
  await show(page, "dated");
  await expect(page.locator("#detail-badges .badge.fresh")).toHaveText(
    `stale after ${STALE_AFTER}`,
  );
  await expect(page.locator("#detail-badges .badge.stale")).toHaveCount(0);
  expect(await staleNodes(page)).toEqual([]);
  await opened.close();
});

for (const now of ["2026-06-01T12:00:00Z", "2027-01-01T00:00:00Z"]) {
  test(`and stale at ${now}`, async ({ page }) => {
    const opened = await openViewer(page, html, { via: "file", now: new Date(now) });
    await show(page, "dated");
    await expect(page.locator("#detail-badges .badge.stale")).toHaveText(
      `stale (since ${STALE_AFTER})`,
    );
    await expect(page.locator("#detail-badges .badge.fresh")).toHaveCount(0);
    expect(await staleNodes(page)).toEqual(["dated"]);
    await opened.close();
  });
}

test("a date without a time is never stale, and a concept without one has no badge", async ({
  page,
}) => {
  const opened = await openViewer(page, html, {
    via: "file",
    now: new Date("2030-01-01T00:00:00Z"),
  });
  await show(page, "date-only");
  await expect(page.locator("#detail-badges .badge.fresh")).toHaveText("stale after 2020-01-01");
  await show(page, "undated");
  await expect(page.locator("#detail-badges .badge")).toHaveText(["stable", "unverified"]);
  expect(await staleNodes(page)).toEqual(["dated"]);
  await opened.close();
});
