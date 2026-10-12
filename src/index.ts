import { buildGraphWithStats, buildRepoGraphWithStats } from "./core/graph.js";
import { renderViewer } from "./core/html.js";
import type { Files, Graph, Options, RepoBundle, Result } from "./types.js";

export { buildGraph } from "./core/graph.js";
export type {
  ActorEvent,
  Edge,
  Files,
  Graph,
  InlineLibraries,
  InlineLibrary,
  Node,
  Options,
  RepoBundle,
  Result,
  Stats,
  TrustTier,
} from "./types.js";

function write(name: string, options: Options, built: { graph: Graph; skipped: number }): Result {
  if (typeof name !== "string") throw new TypeError("name isn't a string");
  const html = renderViewer(
    { name, assetBase: options.assetBase ?? "", graph: built.graph },
    options.libraries,
  );
  return {
    html,
    stats: {
      concepts: built.graph.nodes.length,
      edges: built.graph.edges.length,
      bytes: new TextEncoder().encode(html).length,
      skipped: built.skipped,
    },
  };
}

/** Generates a self-contained HTML viewer for one bundle (SPEC §3.1). */
export function generateViewer(input: { name: string; files: Files; options?: Options }): Result {
  const options = input.options ?? {};
  return write(input.name, options, buildGraphWithStats(input.files, options));
}

/** Generates one viewer over several bundles of a repository (SPEC §3.1). */
export function generateRepoViewer(input: {
  name: string;
  bundles: RepoBundle[];
  options?: Options;
}): Result {
  if (!Array.isArray(input.bundles)) throw new TypeError("bundles isn't an array");
  const options = input.options ?? {};
  return write(input.name, options, buildRepoGraphWithStats(input.bundles, options));
}
