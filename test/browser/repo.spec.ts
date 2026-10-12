// T9, and the rest of the repo viewer: several bundles in one graph
// (SPEC §3.1, §4.1, §5.2).

import { expect, type Page } from "@playwright/test";
import { generateRepoViewer, generateViewer } from "../../src/index.js";
import type { RepoBundle } from "../../src/types.js";
import { type Opened, openViewer, PIXEL_PNG, test } from "./harness.js";

const doc = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}\n`;

const bundles: RepoBundle[] = [
  {
    slug: "sales",
    title: "Sales data",
    root: "bundles/sales",
    files: {
      "tables/orders.md": doc(
        "type: Table\ntitle: Orders\nsources:\n  - title: Customers\n    resource: tables/customers.md",
        "Own [customers](customers.md). The [ledger](../../finance/tables/ledger.md) in finance.\n\n![d](img/d.png)",
      ),
      "tables/customers.md": doc(
        "type: Table\ntitle: Customers",
        "Back to [orders](/tables/orders.md).",
      ),
    },
  },
  {
    slug: "finance",
    title: "Finance",
    root: "bundles/finance",
    files: {
      "tables/orders.md": doc(
        "type: Ledger\ntitle: Finance orders",
        "See the [ledger](ledger.md).",
      ),
      "tables/ledger.md": doc("type: Ledger", "From [sales orders](../../sales/tables/orders.md)."),
    },
  },
];

const repo = generateRepoViewer({ name: "Repo", bundles }).html;

const show = (page: Page, id: string) =>
  page.evaluate((conceptId) => (window as any).okfViewer.showDetail(conceptId), id);
const undimmed = (page: Page) =>
  page.evaluate(() =>
    (window as any).okfViewer.cy
      .nodes()
      .filter((n: any) => !n.hasClass("dim"))
      .map((n: any) => n.data("concept"))
      .sort(),
  );

test.describe("a repo viewer", () => {
  let opened: Opened;
  test.beforeEach(async ({ page }) => {
    opened = await openViewer(page, repo, {
      via: "http",
      files: { "bundles/sales/tables/img/d.png": PIXEL_PNG },
    });
    await expect(page.locator("#detail-content")).toBeVisible();
  });
  test.afterEach(async () => {
    expect(opened.errors).toEqual([]);
    expect(opened.violations).toEqual([]);
    await opened.close();
  });

  test("concepts with the same ID in two bundles are distinct nodes", async ({ page }) => {
    expect(await undimmed(page)).toEqual([
      "finance/tables/ledger",
      "finance/tables/orders",
      "sales/tables/customers",
      "sales/tables/orders",
    ]);
    await show(page, "sales/tables/orders");
    await expect(page.locator("#detail-title")).toHaveText("Orders");
    await show(page, "finance/tables/orders");
    await expect(page.locator("#detail-title")).toHaveText("Finance orders");
  });

  test("the bundle filter shows each bundle's concepts", async ({ page }) => {
    const filter = page.locator("#filter-bundle");
    await expect(filter).toBeVisible();
    await expect(filter.locator("option")).toHaveText(["All bundles", "Finance", "Sales data"]);
    await filter.selectOption("sales");
    expect(await undimmed(page)).toEqual(["sales/tables/customers", "sales/tables/orders"]);
    await filter.selectOption("finance");
    expect(await undimmed(page)).toEqual(["finance/tables/ledger", "finance/tables/orders"]);
    await filter.selectOption("");
    expect(await undimmed(page)).toHaveLength(4);
  });

  test("the bundle filter combines with search and the type filter", async ({ page }) => {
    await page.locator("#search").fill("orders");
    expect(await undimmed(page)).toEqual(["finance/tables/orders", "sales/tables/orders"]);
    await page.locator("#filter-bundle").selectOption("finance");
    expect(await undimmed(page)).toEqual(["finance/tables/orders"]);
    await page.locator("#search").fill("");
    await page.locator("#filter-type").selectOption("Table");
    expect(await undimmed(page)).toEqual([]);
  });

  test("nodes are labelled with their bundle, and the detail panel names it", async ({ page }) => {
    const labels: string[] = await page.evaluate(() =>
      (window as any).okfViewer.cy.nodes().map((n: any) => n.style("label")),
    );
    expect(labels.sort()).toEqual([
      "Customers\n[sales]",
      "Finance orders\n[finance]",
      "Orders\n[sales]",
      "finance/tables/ledger\n[finance]",
    ]);
    await show(page, "sales/tables/orders");
    await expect(page.locator("#detail-bundle")).toHaveText("Sales data");
    await expect(page.locator("#detail-id")).toHaveText("sales/tables/orders");
  });

  test("a link is followed inside its own bundle first", async ({ page }) => {
    await show(page, "finance/tables/orders");
    await page.locator("#detail-body a.internal", { hasText: "ledger" }).click();
    await expect(page.locator("#detail-id")).toHaveText("finance/tables/ledger");
    await show(page, "sales/tables/customers");
    await page.locator("#detail-body a.internal", { hasText: "orders" }).click();
    await expect(page.locator("#detail-id")).toHaveText("sales/tables/orders");
  });

  test("a link that leaves its bundle lands in the other, and is cited there", async ({ page }) => {
    await show(page, "sales/tables/orders");
    await page.locator("#detail-body a.internal", { hasText: "ledger" }).click();
    await expect(page.locator("#detail-id")).toHaveText("finance/tables/ledger");
    await expect(page.locator("#backlinks-list li")).toHaveText([
      "Finance orders (finance/tables/orders)",
      "Orders (sales/tables/orders)",
    ]);
    await page.locator("#detail-body a.internal", { hasText: "sales orders" }).click();
    await expect(page.locator("#detail-id")).toHaveText("sales/tables/orders");
  });

  test("a source is followed from its bundle's root", async ({ page }) => {
    await show(page, "sales/tables/orders");
    await page.locator("#detail-sources a").click();
    await expect(page.locator("#detail-id")).toHaveText("sales/tables/customers");
  });

  test("an image is loaded from its bundle's directory", async ({ page }) => {
    await show(page, "sales/tables/orders");
    const image = page.locator("#detail-body img");
    await expect(image).toHaveAttribute("src", "bundles/sales/tables/img/d.png");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  });
});

test("a single bundle's viewer has no bundle filter", async ({ page }) => {
  const { html } = generateViewer({ name: "One", files: bundles[0]?.files ?? {} });
  const opened = await openViewer(page, html, { via: "file" });
  await expect(page.locator("#detail-content")).toBeVisible();
  await expect(page.locator("#filter-bundle")).toBeHidden();
  await expect(page.locator("#detail-bundle")).toBeHidden();
  await opened.close();
});
