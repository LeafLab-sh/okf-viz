import { VERSION } from "../generated/assets.js";
import type { Edge, Files, Graph, Node, Options, RepoBundle } from "../types.js";
import { codePointLength, compareCodePoints } from "./compare.js";
import { type Concept, toConcept } from "./concept.js";
import { checkPath, normalizeFiles } from "./files.js";
import { parseDocument } from "./frontmatter.js";
import {
  type BundleIndex,
  byInnermost,
  dirOf,
  extractLinkTargets,
  resolveConceptId,
  resolveRepoConceptId,
} from "./links.js";
import { colorForType } from "./palette.js";

// OKF §3.1: reserved at any level of the hierarchy, never concepts.
const RESERVED = new Set(["index.md", "log.md"]);

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function readConcepts(files: Files): { concepts: Concept[]; skipped: number } {
  const concepts: Concept[] = [];
  let skipped = 0;
  for (const [path, content] of normalizeFiles(files)) {
    const name = baseName(path);
    if (RESERVED.has(name)) continue;
    const document = name === ".md" ? null : parseDocument(content);
    if (document === null) {
      skipped++;
      continue;
    }
    concepts.push(toConcept(path.slice(0, -3), document));
  }
  // Files are sorted by path; "a.md" and "a/b.md" order differently as IDs.
  concepts.sort((a, b) => compareCodePoints(a.id, b.id));
  return { concepts, skipped };
}

function toNode(concept: Concept, color: string): Node {
  return {
    id: concept.id,
    label: concept.title,
    type: concept.type,
    description: concept.description,
    resource: concept.resource,
    tags: concept.tags,
    status: concept.status,
    generated: concept.generated,
    verified: concept.verified,
    stale_after: concept.stale_after,
    sources: concept.sources,
    trust_tier: concept.trust_tier,
    // Decided by the viewer, at view time (SPEC §4.2).
    stale: false,
    color,
    size: 30 + Math.min(60, Math.floor(codePointLength(concept.body) / 200)),
  };
}

// U+0000 can't occur in a path, so no two edges share an id and none has the
// id of a node (SPEC §4.1).
const edgeId = (source: string, target: string) => `${source}\u0000${target}`;

/** Edges from each concept to the concepts `resolve` says its links name. */
function linkEdges(
  concepts: Concept[],
  resolve: (link: string, source: string) => string | null,
): Edge[] {
  const edges: Edge[] = [];
  for (const concept of concepts) {
    const targets = new Set<string>();
    for (const link of extractLinkTargets(concept.body)) {
      const target = resolve(link, concept.id);
      if (target !== null && target !== concept.id) targets.add(target);
    }
    for (const target of Array.from(targets).sort(compareCodePoints)) {
      edges.push({ id: edgeId(concept.id, target), source: concept.id, target });
    }
  }
  return edges;
}

function assemble(
  concepts: Concept[],
  edges: Edge[],
  options: Options,
  bundleOf?: Map<string, string>,
): Graph {
  const types = Array.from(new Set(concepts.map((concept) => concept.type))).sort(
    compareCodePoints,
  );
  const palette = new Map(types.map((type) => [type, colorForType(type, options.palette)]));

  // Object.fromEntries defines each key, so a concept or type named
  // `__proto__` becomes a key like any other.
  return {
    format: 1,
    generator: `okf-viz/${VERSION}`,
    nodes: concepts.map((concept) => {
      const data = toNode(concept, palette.get(concept.type) as string);
      const bundle = bundleOf?.get(concept.id);
      return { data: bundle === undefined ? data : { ...data, bundle } };
    }),
    edges: edges.map((data) => ({ data })),
    bodies: Object.fromEntries(concepts.map((concept) => [concept.id, concept.body])),
    types,
    palette: Object.fromEntries(palette),
  };
}

export function buildGraphWithStats(
  files: Files,
  options: Options = {},
): { graph: Graph; skipped: number } {
  const { concepts, skipped } = readConcepts(files);
  const ids = new Set(concepts.map((concept) => concept.id));
  const edges = linkEdges(concepts, (link, source) =>
    resolveConceptId(link, dirOf(source), (id) => ids.has(id)),
  );
  return { graph: assemble(concepts, edges, options), skipped };
}

/** The data a viewer embeds (SPEC §4), for callers that want it alone. */
export function buildGraph(files: Files, options: Options = {}): Graph {
  return buildGraphWithStats(files, options).graph;
}

const SLUG = /^[A-Za-z0-9._-]+$/;

function checkBundles(bundles: readonly RepoBundle[]): void {
  const slugs = new Set<string>();
  const roots = new Set<string>();
  for (const bundle of bundles) {
    if (typeof bundle.slug !== "string" || !SLUG.test(bundle.slug)) {
      throw new TypeError(
        `Bundle slug ${JSON.stringify(bundle.slug)} doesn't match [A-Za-z0-9._-]+`,
      );
    }
    if (typeof bundle.title !== "string") {
      throw new TypeError(`The title of bundle ${bundle.slug} isn't a string`);
    }
    if (typeof bundle.root !== "string") {
      throw new TypeError(`The root of bundle ${bundle.slug} isn't a string`);
    }
    if (bundle.root !== "") checkPath(bundle.root);
    if (slugs.has(bundle.slug)) throw new TypeError(`Two bundles have the slug ${bundle.slug}`);
    if (roots.has(bundle.root)) {
      throw new TypeError(`Two bundles have the root ${JSON.stringify(bundle.root)}`);
    }
    slugs.add(bundle.slug);
    roots.add(bundle.root);
  }
}

/** The data a repo viewer embeds: the bundles' concepts in one graph. */
export function buildRepoGraphWithStats(
  bundles: readonly RepoBundle[],
  options: Options = {},
): { graph: Graph; skipped: number } {
  checkBundles(bundles);
  const sorted = [...bundles].sort((a, b) => compareCodePoints(a.slug, b.slug));

  const concepts: Concept[] = [];
  const bundleOf = new Map<string, string>();
  const indexes = new Map<string, BundleIndex>();
  let skipped = 0;
  for (const bundle of sorted) {
    const read = readConcepts(bundle.files);
    skipped += read.skipped;
    const local = new Set(read.concepts.map((concept) => concept.id));
    indexes.set(bundle.slug, { slug: bundle.slug, root: bundle.root, has: (id) => local.has(id) });
    for (const concept of read.concepts) {
      const id = `${bundle.slug}/${concept.id}`;
      // A concept without a title is labelled with its ID, slug included.
      concepts.push({ ...concept, id, title: concept.title === concept.id ? id : concept.title });
      bundleOf.set(id, bundle.slug);
    }
  }
  concepts.sort((a, b) => compareCodePoints(a.id, b.id));

  const innermost = byInnermost(Array.from(indexes.values()));
  const edges = linkEdges(concepts, (link, source) => {
    const own = indexes.get(bundleOf.get(source) as string) as BundleIndex;
    return resolveRepoConceptId(link, dirOf(source.slice(own.slug.length + 1)), own, innermost);
  });

  const graph = assemble(concepts, edges, options, bundleOf);
  graph.bundles = sorted.map(({ slug, title, root }) => ({ slug, title, root }));
  return { graph, skipped };
}
