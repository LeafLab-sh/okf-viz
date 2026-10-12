// T3: for each example bundle of the OKF repository, the nodes and edges equal
// the reference generator's, apart from the differences SPEC §8 lists. The
// reference's side is what its generator builds for the bundle, at the commit
// SPEC.md names (scripts/vendor-okf-fixtures.mjs).

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildGraph } from "../../src/core/graph.js";
import { dirOf, extractLinkTargets, resolveConceptId } from "../../src/core/links.js";
import type { Node } from "../../src/types.js";
import { fixturePath, readBundle } from "../helpers/fixtures.js";

type ReferenceGraph = {
  nodes: Array<{ data: Node }>;
  edges: Array<{ data: { id: string; source: string; target: string } }>;
  bodies: Record<string, string>;
  types: string[];
};

const BUNDLES = ["acme_retail", "crypto_bitcoin", "ga4", "stackoverflow"];

// §8: the reference shows log.md as a concept; okf-viz excludes it.
const isLog = (id: string) => id === "log" || id.endsWith("/log");

// §8: these keep the reference's colours; every other type differs.
const SAME_COLOR = new Set(["BigQuery Dataset", "BigQuery Table", "Reference"]);

const COMPARED: Array<keyof Node> = [
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
  "size",
];

const pick = (node: Node) => Object.fromEntries(COMPARED.map((key) => [key, node[key]]));
const pair = (edge: { source: string; target: string }) => `${edge.source} -> ${edge.target}`;

describe.each(BUNDLES)("the %s bundle", (name) => {
  const files = readBundle(`okf/${name}`);
  const ours = buildGraph(files);
  const reference: ReferenceGraph = JSON.parse(
    readFileSync(fixturePath(`okf-reference/${name}.json`), "utf8"),
  );
  const referenceNodes = reference.nodes.map((n) => n.data).filter((n) => !isLog(n.id));
  const byId = new Map(ours.nodes.map((n) => [n.data.id, n.data]));

  test("has the reference's concepts", () => {
    expect([...byId.keys()].sort()).toEqual(referenceNodes.map((n) => n.id).sort());
    expect(referenceNodes.length).toBeGreaterThan(0);
  });

  test("gives each node the reference's fields", () => {
    for (const expected of referenceNodes) {
      expect(pick(byId.get(expected.id) as Node), expected.id).toEqual(pick(expected));
    }
  });

  test("keeps the reference's colour for the types it names", () => {
    for (const expected of referenceNodes) {
      if (SAME_COLOR.has(expected.type)) {
        expect(byId.get(expected.id)?.color, expected.id).toBe(expected.color);
      }
    }
  });

  test("has the reference's bodies", () => {
    for (const expected of referenceNodes) {
      expect(ours.bodies[expected.id], expected.id).toBe(reference.bodies[expected.id]);
    }
  });

  test("has the reference's types", () => {
    expect(ours.types).toEqual([...new Set(referenceNodes.map((n) => n.type))].sort());
  });

  test("draws the reference's edges, and beyond them only those of bundle-absolute links", () => {
    const referencePairs = reference.edges
      .map((e) => e.data)
      .filter((e) => !isLog(e.source) && !isLog(e.target))
      .map(pair)
      .sort();

    // What okf-viz draws when '/'-absolute links are left out, as the
    // reference leaves them out.
    const relativeOnly = new Set<string>();
    for (const [source, body] of Object.entries(ours.bodies)) {
      for (const link of extractLinkTargets(body)) {
        if (link.startsWith("/")) continue;
        const target = resolveConceptId(link, dirOf(source), (id) => byId.has(id));
        if (target !== null && target !== source) relativeOnly.add(pair({ source, target }));
      }
    }
    expect([...relativeOnly].sort()).toEqual(referencePairs);

    const ourPairs = new Set(ours.edges.map((e) => pair(e.data)));
    for (const expected of referencePairs) expect(ourPairs).toContain(expected);
  });
});
