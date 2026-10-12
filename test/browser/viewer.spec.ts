// What a reader of the viewer sees and can do (SPEC §5).

import { expect, type Page } from "@playwright/test";
import { VERSION } from "../../src/generated/assets.js";
import { generateViewer } from "../../src/index.js";
import { readBundle } from "../helpers/fixtures.js";
import { type Opened, openViewer, PIXEL_PNG, test } from "./harness.js";

type Viewer = {
  cy: {
    nodes(selector?: string): { length: number; map<T>(f: (n: any) => T): T[] };
    edges(selector?: string): { length: number };
  };
  showDetail(id: string): void;
};
const viewer = (page: Page) => page.evaluateHandle(() => (window as any).okfViewer as Viewer);

const undimmed = (page: Page) =>
  page.evaluate(() =>
    ((window as any).okfViewer as Viewer).cy
      .nodes()
      .map((n) => (n.hasClass("dim") ? null : n.data("concept")))
      .filter((id) => id !== null)
      .sort(),
  );

const edge = generateViewer({ name: "Edge cases", files: readBundle("edge") }).html;

test.describe("a bundle's viewer", () => {
  let opened: Opened;
  test.beforeEach(async ({ page }) => {
    opened = await openViewer(page, edge, { via: "file" });
    await expect(page.locator("#detail-content")).toBeVisible();
  });
  test.afterEach(async () => {
    expect(opened.errors).toEqual([]);
    expect(opened.violations).toEqual([]);
    await opened.close();
  });

  test("shows the bundle's name and the version that built it", async ({ page }) => {
    await expect(page).toHaveTitle("Edge cases — OKF Viewer");
    await expect(page.locator("#bundle-name")).toHaveText("Edge cases");
    await expect(page.locator("#generator")).toHaveText(`okf-viz/${VERSION}`);
  });

  test("draws a node for every concept and an edge for every link", async ({ page }) => {
    const handle = await viewer(page);
    expect(await handle.evaluate((v) => v.cy.nodes().length)).toBe(4);
    expect(await handle.evaluate((v) => v.cy.edges().length)).toBe(4);
  });

  test("shows a concept's frontmatter beside the graph", async ({ page }) => {
    await (await viewer(page)).evaluate((v) => v.showDetail("tables/orders"));
    await expect(page.locator("#detail-type")).toHaveText("BigQuery Table");
    await expect(page.locator("#detail-title")).toHaveText("Orders");
    await expect(page.locator("#detail-id")).toHaveText("tables/orders");
    await expect(page.locator("#detail-description")).toHaveText("One row per order.");
    await expect(page.locator("#detail-tags .tag")).toHaveText(["sales", "core"]);
    await expect(page.locator("#detail-generated")).toHaveText(
      "agent:reference · 2026-09-01T00:00:00Z",
    );
    await expect(page.locator("#detail-verified")).toHaveText("human:lea · 2026-09-02T00:00:00Z");
    await expect(page.locator("#detail-badges .badge")).toHaveText([
      "stable",
      "human reviewed",
      /stale/,
    ]);
    const resource = page.locator("#detail-resource a");
    await expect(resource).toHaveAttribute("href", "https://example.com/tables/orders");
    await expect(resource).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("a source that is another concept links to it inside the viewer", async ({ page }) => {
    await (await viewer(page)).evaluate((v) => v.showDetail("tables/orders"));
    const sources = page.locator("#detail-sources li");
    await expect(sources).toHaveCount(2);
    await expect(sources.nth(0).locator("a")).toHaveAttribute(
      "href",
      "https://example.com/dictionary",
    );
    await sources.nth(1).locator("a").click();
    await expect(page.locator("#detail-id")).toHaveText("notes/plain");
  });

  test("lists the concepts that cite the selected one, and follows them", async ({ page }) => {
    await (await viewer(page)).evaluate((v) => v.showDetail("tables/orders"));
    const cited = page.locator("#backlinks-list li");
    await expect(cited).toHaveText([
      "notes/plain (notes/plain)",
      "tables/customers (tables/customers)",
    ]);
    await cited.nth(1).locator("a").click();
    await expect(page.locator("#detail-id")).toHaveText("tables/customers");
    await expect(page.locator("#detail-backlinks")).toBeVisible();
  });

  test("a concept nothing cites has no 'Cited by' list", async ({ page }) => {
    await (await viewer(page)).evaluate((v) => v.showDetail("notes/untyped"));
    await expect(page.locator("#detail-backlinks")).toBeHidden();
  });

  test("search dims the concepts that don't match title, ID or tag", async ({ page }) => {
    await page.locator("#search").fill("ORDERS");
    expect(await undimmed(page)).toEqual(["tables/orders"]);
    await page.locator("#search").fill("solo");
    expect(await undimmed(page)).toEqual(["tables/customers"]);
    await page.locator("#search").fill("notes/");
    expect(await undimmed(page)).toEqual(["notes/plain", "notes/untyped"]);
    await page.locator("#search").fill("");
    expect(await undimmed(page)).toHaveLength(4);
  });

  test("the type filter lists every type and dims the others", async ({ page }) => {
    await expect(page.locator("#filter-type option")).toHaveText([
      "All types",
      "BigQuery Table",
      "Custom Thing",
      "Unknown",
    ]);
    await page.locator("#filter-type").selectOption("Unknown");
    expect(await undimmed(page)).toEqual(["notes/plain", "notes/untyped"]);
  });

  test("search and the type filter combine", async ({ page }) => {
    await page.locator("#filter-type").selectOption("Unknown");
    await page.locator("#search").fill("plain");
    expect(await undimmed(page)).toEqual(["notes/plain"]);
    await page.locator("#search").fill("");
    expect(await undimmed(page)).toEqual(["notes/plain", "notes/untyped"]);
    await page.locator("#filter-type").selectOption("");
    expect(await undimmed(page)).toHaveLength(4);
  });

  test("every layout runs", async ({ page }) => {
    for (const layout of ["concentric", "breadthfirst", "circle", "grid", "cose"]) {
      await page.locator("#layout").selectOption(layout);
    }
    const positions = await (await viewer(page)).evaluate((v) =>
      v.cy.nodes().map((n) => `${Math.round(n.position("x"))},${Math.round(n.position("y"))}`),
    );
    expect(new Set(positions).size).toBe(4);
  });

  test("reset clears the selection", async ({ page }) => {
    await page.locator("#reset").click();
    await expect(page.locator("#detail-content")).toBeHidden();
    await expect(page.locator("#detail-empty")).toBeVisible();
  });
});

test("an empty bundle shows an empty viewer, not an error", async ({ page }) => {
  const { html } = generateViewer({ name: "Empty", files: { "index.md": "# Nothing" } });
  const opened = await openViewer(page, html, { via: "file" });
  await expect(page.locator("#detail-empty")).toHaveText("This bundle has no concepts.");
  expect(opened.errors).toEqual([]);
  expect(opened.violations).toEqual([]);
  await opened.close();
});

test("without the libraries, the viewer says it needs a connection", async ({ page }) => {
  const opened = await openViewer(page, edge, { via: "file", offline: true });
  await expect(page.locator("#offline")).toBeVisible();
  await expect(page.locator("#offline")).toContainText("network connection");
  await expect(page.locator("main")).toBeHidden();
  await opened.close();
});

test.describe("a concept's body", () => {
  const files = {
    "tables/orders.md":
      "---\ntype: Reference\ntitle: Orders\n---\n\n# Schema\n\nA *rendered* body with `code`.\n\n" +
      "- [relative](customers.md)\n- [dotted](./customers.md#keys)\n- [absolute](/notes/top.md)\n" +
      "- [up](../notes/top.md)\n- [missing](nowhere.md)\n- [site](https://example.com/docs)\n\n" +
      "![a diagram](img/flow.png)\n\n![a remote chart](https://example.com/chart.png)\n",
    "tables/customers.md":
      "---\ntype: Reference\ntitle: Customers\n---\n\nBack to [orders](orders.md).\n",
    "notes/top.md": "---\ntype: Reference\ntitle: Top\n---\n\nSee [orders](/tables/orders.md).\n",
  };
  const show = (page: Page, id: string) =>
    page.evaluate((conceptId) => (window as any).okfViewer.showDetail(conceptId), id);

  test("is rendered as markdown", async ({ page }) => {
    const { html } = generateViewer({ name: "Body", files });
    const opened = await openViewer(page, html, {
      via: "file",
      files: { "tables/img/flow.png": PIXEL_PNG },
    });
    await show(page, "tables/orders");
    const body = page.locator("#detail-body");
    await expect(body.locator("h1")).toHaveText("Schema");
    await expect(body.locator("em")).toHaveText("rendered");
    await expect(body.locator("code")).toHaveText("code");
    expect(opened.errors).toEqual([]);
    await opened.close();
  });

  for (const [text, id] of [
    ["relative", "tables/customers"],
    ["dotted", "tables/customers"],
    ["absolute", "notes/top"],
    ["up", "notes/top"],
  ] as const) {
    test(`a ${text} link to a concept navigates inside the viewer`, async ({ page }) => {
      const { html } = generateViewer({ name: "Body", files });
      const opened = await openViewer(page, html, {
        via: "file",
        files: { "tables/img/flow.png": PIXEL_PNG },
      });
      await show(page, "tables/orders");
      await page.locator("#detail-body a.internal", { hasText: text }).click();
      await expect(page.locator("#detail-id")).toHaveText(id);
      expect(page.url()).toBe(opened.url);
      await opened.close();
    });
  }

  test("a link to a missing concept is text, and a link to a site opens elsewhere", async ({
    page,
  }) => {
    const { html } = generateViewer({ name: "Body", files });
    const opened = await openViewer(page, html, {
      via: "file",
      files: { "tables/img/flow.png": PIXEL_PNG },
    });
    await show(page, "tables/orders");
    const body = page.locator("#detail-body");
    await expect(body.locator("a", { hasText: "missing" })).toHaveCount(0);
    await expect(body).toContainText("missing");
    const site = body.locator("a.external", { hasText: "site" });
    await expect(site).toHaveAttribute("href", "https://example.com/docs");
    await expect(site).toHaveAttribute("target", "_blank");
    await expect(site).toHaveAttribute("rel", "noopener noreferrer");
    await opened.close();
  });

  for (const via of ["file", "http"] as const) {
    test(`an image inside the bundle is shown and a remote one is a link, opened by ${via}`, async ({
      page,
    }) => {
      const { html } = generateViewer({ name: "Body", files });
      const opened = await openViewer(page, html, {
        via,
        files: { "tables/img/flow.png": PIXEL_PNG },
      });
      await show(page, "tables/orders");
      const body = page.locator("#detail-body");
      await expect(body.locator("img")).toHaveCount(1);
      await expect(body.locator("img")).toHaveAttribute("alt", "a diagram");
      await expect
        .poll(() => body.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBe(1);
      const chart = body.locator("a.external", { hasText: "a remote chart" });
      await expect(chart).toHaveAttribute("href", "https://example.com/chart.png");
      expect(opened.violations).toEqual([]);
      expect(opened.sent.filter((request) => request.includes("example.com"))).toEqual([]);
      await opened.close();
    });
  }

  test("assetBase is put before an image's path", async ({ page }) => {
    const { html } = generateViewer({ name: "Body", files, options: { assetBase: "bundle/" } });
    const opened = await openViewer(page, html, {
      via: "http",
      files: { "bundle/tables/img/flow.png": PIXEL_PNG },
    });
    await show(page, "tables/orders");
    const image = page.locator("#detail-body img");
    await expect(image).toHaveAttribute("src", "bundle/tables/img/flow.png");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await opened.close();
  });
});

test("concept IDs that contain __ don't collide in the graph", async ({ page }) => {
  const doc = (body: string) => `---\ntype: T\n---\n\n${body}\n`;
  const { html } = generateViewer({
    name: "Underscores",
    files: {
      "a__b.md": doc("[c](c.md)"),
      "a.md": doc("[bc](b__c.md) [b](b.md)"),
      "b__c.md": doc(""),
      "c.md": doc(""),
      "b.md": doc(""),
      "a__b__c.md": doc(""),
    },
  });
  const opened = await openViewer(page, html, { via: "file" });
  await expect(page.locator("#detail-content")).toBeVisible();
  expect(await page.evaluate(() => (window as any).okfViewer.cy.nodes().length)).toBe(6);
  expect(await page.evaluate(() => (window as any).okfViewer.cy.edges().length)).toBe(3);
  expect(opened.errors).toEqual([]);
  await opened.close();
});

// OKF §5.1 calls a source's path "bundle-relative", and the OKF example
// bundles write it from the bundle root without a leading slash.
test("a source written from the bundle root, without a slash, is followed too", async ({
  page,
}) => {
  const { html } = generateViewer({
    name: "Sources",
    files: {
      "metrics/margin.md":
        "---\ntype: Metric\ntitle: Margin\nsources:\n  - title: The policy\n    resource: policies/standard.md\n" +
        "  - title: A sibling\n    resource: revenue.md\n  - title: Nowhere\n    resource: policies/gone.md\n---\n\nBody.\n",
      "metrics/revenue.md": "---\ntype: Metric\ntitle: Revenue\n---\n\nBody.\n",
      "policies/standard.md": "---\ntype: Policy\ntitle: Standard\n---\n\nBody.\n",
    },
  });
  const opened = await openViewer(page, html, { via: "file" });
  await page.evaluate(() => (window as any).okfViewer.showDetail("metrics/margin"));
  const sources = page.locator("#detail-sources li");
  await expect(sources).toHaveText(["The policy", "A sibling", "Nowhere (policies/gone.md)"]);
  await expect(sources.nth(2).locator("a")).toHaveCount(0);
  await sources.nth(1).locator("a").click();
  await expect(page.locator("#detail-id")).toHaveText("metrics/revenue");
  await page.evaluate(() => (window as any).okfViewer.showDetail("metrics/margin"));
  await sources.nth(0).locator("a").click();
  await expect(page.locator("#detail-id")).toHaveText("policies/standard");
  await opened.close();
});
