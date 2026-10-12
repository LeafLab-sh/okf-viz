// SPEC §5.3: a viewer that carries its libraries needs no network at all.

import { expect } from "@playwright/test";
import { generateViewer } from "../../src/index.js";
import { inlineLibraries } from "../../src/inline.js";
import { readBundle } from "../helpers/fixtures.js";
import { openViewer, test, type Via } from "./harness.js";
import { hostileBundle } from "./hostile.js";

const options = { libraries: inlineLibraries };

for (const via of ["file", "http"] as Via[]) {
  test(`works with no network, and asks for nothing, opened by ${via}`, async ({ page }) => {
    const { html } = generateViewer({ name: "Edge cases", files: readBundle("edge"), options });
    // Every request to another origin would be refused, as when offline.
    const opened = await openViewer(page, html, { via, offline: true });
    try {
      await expect(page.locator("#detail-content")).toBeVisible();
      await expect(page.locator("#offline")).toBeHidden();
      expect(await page.evaluate(() => (window as any).okfViewer.cy.nodes().length)).toBe(4);
      await page.evaluate(() => (window as any).okfViewer.showDetail("tables/orders"));
      await expect(page.locator("#detail-body h1")).toHaveText("Schema");
      await page.locator("#detail-body a.internal", { hasText: "customers" }).click();
      await expect(page.locator("#detail-id")).toHaveText("tables/customers");

      expect(opened.requests).toEqual([]);
      expect(opened.sent).toEqual([]);
      expect(opened.violations).toEqual([]);
      expect(opened.errors).toEqual([]);
    } finally {
      await opened.close();
    }
  });
}

test("a hostile bundle still runs nothing and requests nothing", async ({ page }) => {
  const ran: string[] = [];
  await page.exposeFunction("__pwned", (tag: string) => {
    ran.push(tag);
  });
  const { html } = generateViewer({
    name: "Hostile",
    files: hostileBundle({ metaRefresh: true }),
    options,
  });
  const opened = await openViewer(page, html, { via: "file", offline: true });
  try {
    await expect(page.locator("#detail-content")).toBeVisible();
    const ids: string[] = await page.evaluate(() =>
      (window as any).okfViewer.cy.nodes().map((n: any) => n.data("concept")),
    );
    for (const id of ids) {
      await page.evaluate((concept) => (window as any).okfViewer.showDetail(concept), id);
      await expect(page.locator("#detail-id")).toHaveText(id);
    }
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(ran).toEqual([]);
    expect(opened.requests).toEqual([]);
    expect(opened.violations).toEqual([]);
    expect(opened.errors).toEqual([]);
    expect(page.url()).toBe(opened.url);
  } finally {
    await opened.close();
  }
});
