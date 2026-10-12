/** Bundle files: paths relative to the bundle root, '/' separated, to their text. */
export type Files = Record<string, string> | Iterable<readonly [path: string, content: string]>;

export type Options = {
  /** Type name to colour, overriding the built-in palette. */
  palette?: Record<string, string>;
  /** Prefix for relative image paths: a relative prefix or an `https:` URL. */
  assetBase?: string;
  /**
   * Where the viewer gets Cytoscape.js and marked. `"cdn"`, the default, loads
   * them from jsDelivr, pinned and hash-checked, so the viewer needs a network
   * connection. Passing `inlineLibraries`, from the package's `inline` entry,
   * writes them into the viewer, which then loads nothing and is about 400 kB
   * larger.
   */
  libraries?: "cdn" | InlineLibraries;
};

/** A library's source, and the SHA-256 of that text in base64. */
export type InlineLibrary = { code: string; sha256: string };

export type InlineLibraries = { cytoscape: InlineLibrary; marked: InlineLibrary };

export type Stats = { concepts: number; edges: number; bytes: number; skipped: number };

export type Result = { html: string; stats: Stats };

export type ActorEvent = { by?: string; at?: string };

export type TrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

export type Node = {
  id: string;
  label: string;
  type: string;
  description: string;
  resource: string;
  tags: string[];
  status: string;
  generated: ActorEvent;
  verified: ActorEvent[];
  stale_after: string;
  sources: Array<Record<string, unknown>>;
  trust_tier: TrustTier;
  stale: boolean;
  color: string;
  size: number;
  /** Repo viewer only: the bundle's slug. */
  bundle?: string;
};

export type Edge = { id: string; source: string; target: string };

export type Graph = {
  format: 1;
  generator: string;
  nodes: Array<{ data: Node }>;
  edges: Array<{ data: Edge }>;
  bodies: Record<string, string>;
  types: string[];
  palette: Record<string, string>;
  /** Repo viewer only. */
  bundles?: Array<{ slug: string; title: string; root: string }>;
};

export type RepoBundle = { slug: string; title: string; root: string; files: Files };
