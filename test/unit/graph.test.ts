import { describe, expect, test } from "vitest";
import { buildGraph, buildGraphWithStats } from "../../src/core/graph.js";
import { VERSION } from "../../src/generated/assets.js";
import { readBundle } from "../helpers/fixtures.js";

const doc = (body: string, frontmatter = "type: T") => `---\n${frontmatter}\n---\n\n${body}\n`;
const pairs = (graph: ReturnType<typeof buildGraph>) =>
  graph.edges.map((edge) => `${edge.data.source} -> ${edge.data.target}`);

describe("buildGraph", () => {
  test("names its format and the version that built it", () => {
    const graph = buildGraph({});
    expect(graph.format).toBe(1);
    expect(graph.generator).toBe(`okf-viz/${VERSION}`);
  });

  test("an empty bundle is an empty graph", () => {
    expect(buildGraph({ "index.md": "# Index" })).toMatchObject({
      nodes: [],
      edges: [],
      bodies: {},
      types: [],
      palette: {},
    });
  });

  test("a concept's ID is its path without .md", () => {
    const graph = buildGraph({ "tables/orders.md": doc("x") });
    expect(graph.nodes.map((node) => node.data.id)).toEqual(["tables/orders"]);
  });

  test("index.md and log.md aren't concepts at any depth", () => {
    const graph = buildGraph({
      "index.md": "# I",
      "log.md": "# L",
      "a/index.md": "# I",
      "a/b/log.md": "# L",
      "a/catalog.md": doc("x"),
    });
    expect(graph.nodes.map((node) => node.data.id)).toEqual(["a/catalog"]);
  });

  test("a node's size grows with its body, up to a limit", () => {
    const size = (body: string) => buildGraph({ "a.md": doc(body) }).nodes[0]?.data.size;
    expect(size("x")).toBe(30);
    expect(size("x".repeat(400))).toBe(32);
    expect(size("x".repeat(100_000))).toBe(90);
    // 200 astral characters are 200 code points, not 400.
    expect(size("\u{1F600}".repeat(200))).toBe(31);
  });

  test("a node is never written as stale", () => {
    const graph = buildGraph({ "a.md": doc("x", "type: T\nstale_after: 2000-01-01T00:00:00Z") });
    expect(graph.nodes[0]?.data).toMatchObject({
      stale: false,
      stale_after: "2000-01-01T00:00:00Z",
    });
  });

  test("a node's keys are in the order the specification lists", () => {
    const graph = buildGraph({ "a.md": doc("x") });
    expect(Object.keys(graph)).toEqual([
      "format",
      "generator",
      "nodes",
      "edges",
      "bodies",
      "types",
      "palette",
    ]);
    expect(Object.keys(graph.nodes[0]?.data ?? {})).toEqual([
      "id",
      "label",
      "type",
      "description",
      "resource",
      "tags",
      "status",
      "generated",
      "verified",
      "stale_after",
      "sources",
      "trust_tier",
      "stale",
      "color",
      "size",
    ]);
  });

  describe("edges", () => {
    test("a relative link draws an edge", () => {
      const graph = buildGraph({
        "tables/a.md": doc("[b](b.md) [c](../metrics/c.md)"),
        "tables/b.md": doc("x"),
        "metrics/c.md": doc("x"),
      });
      expect(pairs(graph)).toEqual(["tables/a -> metrics/c", "tables/a -> tables/b"]);
    });

    test("a bundle-absolute link draws an edge", () => {
      const graph = buildGraph({
        "deep/down/a.md": doc("[b](/tables/b.md)"),
        "tables/b.md": doc("x"),
      });
      expect(pairs(graph)).toEqual(["deep/down/a -> tables/b"]);
    });

    test("a fragment is ignored", () => {
      const graph = buildGraph({ "a.md": doc("[b](b.md#schema)"), "b.md": doc("x") });
      expect(pairs(graph)).toEqual(["a -> b"]);
    });

    test("links out of the bundle, to nothing, and to itself draw no edge", () => {
      const graph = buildGraph({
        "a.md": doc("[up](../b.md) [gone](gone.md) [self](a.md) [web](https://x.test/b.md)"),
        "b.md": doc("x"),
      });
      expect(pairs(graph)).toEqual([]);
    });

    test("a link to index.md or log.md draws no edge", () => {
      const graph = buildGraph({ "a.md": doc("[i](index.md) [l](log.md)"), "index.md": "# I" });
      expect(pairs(graph)).toEqual([]);
    });

    test("many links from A to B draw one edge", () => {
      const graph = buildGraph({
        "a.md": doc("[b](b.md) [b](./b.md) [b](/b.md)"),
        "b.md": doc(""),
      });
      expect(pairs(graph)).toEqual(["a -> b"]);
    });

    test("edges are sorted by source, then target", () => {
      const graph = buildGraph({
        "b.md": doc("[c](c.md) [a](a.md)"),
        "a.md": doc("[c](c.md) [b](b.md)"),
        "c.md": doc(""),
      });
      expect(pairs(graph)).toEqual(["a -> b", "a -> c", "b -> a", "b -> c"]);
    });

    test("IDs that contain __ still give every edge its own id", () => {
      const graph = buildGraph({
        "a__b.md": doc("[c](c.md)"),
        "a.md": doc("[bc](b__c.md) [b](b.md)"),
        "b__c.md": doc(""),
        "c.md": doc(""),
        "b.md": doc(""),
        "a__b__c.md": doc(""),
      });
      const ids = [
        ...graph.edges.map((edge) => edge.data.id),
        ...graph.nodes.map((node) => node.data.id),
      ];
      expect(graph.edges).toHaveLength(3);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  test("the result doesn't depend on the order of the files", () => {
    const files = readBundle("edge");
    const forward = JSON.stringify(buildGraph(files));
    const reversed = JSON.stringify(buildGraph(Object.entries(files).reverse()));
    expect(reversed).toBe(forward);
  });

  test("the result survives JSON unchanged", () => {
    const graph = buildGraph({
      ...readBundle("edge"),
      "odd.md": doc("x", "type: T\nsources:\n  - score: .nan\n    limit: .inf"),
    });
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  });

  test("names from Object.prototype are ordinary concepts and types", () => {
    const graph = buildGraph({
      "__proto__.md": doc("[c](constructor.md)", "type: __proto__"),
      "constructor.md": doc("[t](toString.md)", "type: constructor"),
      "toString.md": doc("[p](__proto__.md)", "type: toString"),
    });
    expect(graph.nodes.map((node) => node.data.id)).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
    expect(pairs(graph)).toEqual([
      "__proto__ -> constructor",
      "constructor -> toString",
      "toString -> __proto__",
    ]);
    expect(graph.types).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.keys(graph.bodies)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.keys(graph.palette)).toEqual(["__proto__", "constructor", "toString"]);
    const revived = JSON.parse(JSON.stringify(graph));
    expect(Object.getOwnPropertyDescriptor(revived.bodies, "__proto__")?.value).toBe(
      "[c](constructor.md)",
    );
  });

  test("a caller's palette colours its types", () => {
    const graph = buildGraph(
      { "a.md": doc("x", "type: Metric") },
      { palette: { Metric: "#123456" } },
    );
    expect(graph.nodes[0]?.data.color).toBe("#123456");
    expect(graph.palette).toEqual({ Metric: "#123456" });
  });

  describe("a bundle with missing frontmatter, unknown types, broken links and a bare verified mapping", () => {
    const { graph, skipped } = buildGraphWithStats(readBundle("edge"));
    const node = (id: string) => graph.nodes.find((n) => n.data.id === id)?.data;

    test("renders every concept that parses, and counts those that don't", () => {
      expect(graph.nodes.map((n) => n.data.id)).toEqual([
        "notes/plain",
        "notes/untyped",
        "tables/customers",
        "tables/orders",
      ]);
      expect(skipped).toBe(2);
    });

    test("a file with no frontmatter block is an Unknown concept whose text is its body", () => {
      expect(node("notes/plain")).toMatchObject({ type: "Unknown", label: "notes/plain" });
      expect(graph.bodies["notes/plain"]).toMatch(/^# A note with no frontmatter\n/);
    });

    test("a bare verified mapping is one event", () => {
      expect(node("tables/orders")).toMatchObject({
        verified: [{ by: "human:lea", at: "2026-09-02T00:00:00Z" }],
        trust_tier: "human-reviewed",
      });
      expect(node("tables/customers")?.trust_tier).toBe("machine-confirmed");
    });

    test("broken links draw nothing, and the rest draw edges", () => {
      expect(pairs(graph)).toEqual([
        "notes/plain -> tables/orders",
        "tables/customers -> tables/orders",
        "tables/orders -> notes/plain",
        "tables/orders -> tables/customers",
      ]);
    });

    test("types and palette are sorted, and cover every type present", () => {
      expect(graph.types).toEqual(["BigQuery Table", "Custom Thing", "Unknown"]);
      expect(Object.keys(graph.palette)).toEqual(graph.types);
    });
  });
});
