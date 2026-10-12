import { describe, expect, test } from "vitest";
import { buildRepoGraphWithStats } from "../../src/core/graph.js";
import { generateRepoViewer, generateViewer } from "../../src/index.js";
import type { RepoBundle } from "../../src/types.js";

const doc = (body: string, frontmatter = "type: T") => `---\n${frontmatter}\n---\n\n${body}\n`;

const sales: RepoBundle = {
  slug: "sales",
  title: "Sales",
  root: "bundles/sales",
  files: {
    "index.md": "# Sales",
    "tables/orders.md": doc(
      "[c](customers.md) [fin](../../finance/tables/ledger.md) [gone](../../finance/gone.md) [out](../../../README.md)",
      "type: Table\ntitle: Orders",
    ),
    "tables/customers.md": doc("[o](/tables/orders.md)", "type: Table\ntitle: Customers"),
  },
};
const finance: RepoBundle = {
  slug: "finance",
  title: "Finance",
  root: "bundles/finance",
  files: {
    "tables/ledger.md": doc(
      "[o](../../sales/tables/orders.md) [self](../../finance/tables/ledger.md)",
      "type: Table",
    ),
    "tables/orders.md": doc("[l](ledger.md)", "type: Ledger\ntitle: Finance orders"),
    "broken.md": "---\ntype: [\n---\n",
  },
};

const build = (bundles: RepoBundle[]) => buildRepoGraphWithStats(bundles);
const pairs = (bundles: RepoBundle[]) =>
  build(bundles).graph.edges.map((e) => `${e.data.source} -> ${e.data.target}`);

describe("buildRepoGraph", () => {
  const { graph, skipped } = build([sales, finance]);

  test("prefixes every concept ID with its bundle's slug", () => {
    expect(graph.nodes.map((n) => n.data.id)).toEqual([
      "finance/tables/ledger",
      "finance/tables/orders",
      "sales/tables/customers",
      "sales/tables/orders",
    ]);
    expect(Object.keys(graph.bodies)).toEqual(graph.nodes.map((n) => n.data.id));
  });

  test("concepts with the same ID in two bundles are distinct nodes", () => {
    const orders = graph.nodes.filter((n) => n.data.id.endsWith("/tables/orders"));
    expect(orders.map((n) => [n.data.bundle, n.data.label])).toEqual([
      ["finance", "Finance orders"],
      ["sales", "Orders"],
    ]);
  });

  test("names each node's bundle, last among its keys", () => {
    for (const node of graph.nodes) {
      expect(Object.keys(node.data).at(-1)).toBe("bundle");
      expect(node.data.id.startsWith(`${node.data.bundle}/`)).toBe(true);
    }
  });

  test("lists the bundles, sorted by slug, after the palette", () => {
    expect(graph.bundles).toEqual([
      { slug: "finance", title: "Finance", root: "bundles/finance" },
      { slug: "sales", title: "Sales", root: "bundles/sales" },
    ]);
    expect(Object.keys(graph).at(-1)).toBe("bundles");
  });

  test("resolves a link inside its own bundle", () => {
    expect(pairs([sales, finance])).toContain("sales/tables/orders -> sales/tables/customers");
    expect(pairs([sales, finance])).toContain("sales/tables/customers -> sales/tables/orders");
    expect(pairs([sales, finance])).toContain("finance/tables/orders -> finance/tables/ledger");
  });

  test("a link that leaves its bundle and lands on a concept of another draws an edge", () => {
    expect(pairs([sales, finance])).toContain("sales/tables/orders -> finance/tables/ledger");
    expect(pairs([sales, finance])).toContain("finance/tables/ledger -> sales/tables/orders");
  });

  test("a link that leaves its bundle and lands on nothing draws none", () => {
    expect(pairs([sales, finance])).toHaveLength(5);
  });

  test("counts skipped files across bundles", () => {
    expect(skipped).toBe(1);
  });

  test("doesn't depend on the order of the bundles", () => {
    expect(JSON.stringify(build([finance, sales]).graph)).toBe(JSON.stringify(graph));
  });

  test("a link into nested roots lands in the innermost bundle that has the concept", () => {
    const outer: RepoBundle = {
      slug: "outer",
      title: "Outer",
      root: "kb",
      files: { "a.md": doc("x"), "inner/only-outer.md": doc("x") },
    };
    const inner: RepoBundle = {
      slug: "inner",
      title: "Inner",
      root: "kb/inner",
      files: { "b.md": doc("x") },
    };
    const other: RepoBundle = {
      slug: "other",
      title: "Other",
      root: "elsewhere",
      files: {
        "c.md": doc("[b](../kb/inner/b.md) [o](../kb/inner/only-outer.md) [a](../kb/a.md)"),
      },
    };
    expect(pairs([outer, inner, other])).toEqual([
      "other/c -> inner/b",
      "other/c -> outer/a",
      "other/c -> outer/inner/only-outer",
    ]);
  });

  test("a bundle at the repository root can be linked into", () => {
    const top: RepoBundle = { slug: "top", title: "Top", root: "", files: { "a.md": doc("x") } };
    const sub: RepoBundle = {
      slug: "sub",
      title: "Sub",
      root: "docs/kb",
      files: { "b.md": doc("[a](../../a.md)") },
    };
    expect(pairs([top, sub])).toEqual(["sub/b -> top/a"]);
  });

  describe("a malformed call", () => {
    const bundle = (overrides: Partial<RepoBundle>): RepoBundle => ({
      slug: "a",
      title: "A",
      root: "a",
      files: {},
      ...overrides,
    });
    test.each([
      ["a slug with a slash", [bundle({ slug: "a/b" })]],
      ["an empty slug", [bundle({ slug: "" })]],
      ["a slug with a space", [bundle({ slug: "a b" })]],
      ["two bundles with one slug", [bundle({}), bundle({ root: "b" })]],
      ["two bundles with one root", [bundle({}), bundle({ slug: "b" })]],
      ["a root that begins with /", [bundle({ root: "/a" })]],
      ["a root with a .. segment", [bundle({ root: "a/../b" })]],
      ["a root with a backslash", [bundle({ root: "a\\b" })]],
      ["a title that isn't a string", [bundle({ title: 1 as unknown as string })]],
    ])("%s throws", (_, bundles) => {
      expect(() => build(bundles)).toThrow(TypeError);
    });
  });
});

describe("generateRepoViewer", () => {
  test("writes one viewer over the bundles", () => {
    const { html, stats } = generateRepoViewer({ name: "Repo", bundles: [sales, finance] });
    expect(stats).toEqual({
      concepts: 4,
      edges: 5,
      skipped: 1,
      bytes: new TextEncoder().encode(html).length,
    });
    const data = JSON.parse(
      /<script type="application\/json" id="okf-data">(.*?)<\/script>/s.exec(html)?.[1] as string,
    );
    expect(data.name).toBe("Repo");
    expect(data.graph.bundles).toHaveLength(2);
  });

  test("gives the same bytes whatever order the bundles are in", () => {
    const a = generateRepoViewer({ name: "Repo", bundles: [sales, finance] });
    const b = generateRepoViewer({ name: "Repo", bundles: [finance, sales] });
    expect(b.html).toBe(a.html);
  });

  test("a single bundle's viewer has no trace of the repo fields", () => {
    const { html } = generateViewer({ name: "One", files: sales.files });
    expect(html).not.toContain('"bundles":');
    expect(html).not.toContain('"bundle":');
  });
});
