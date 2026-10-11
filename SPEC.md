# okf-viz — Specification

**Status:** Draft 1, for review. Nothing is implemented.
**Last updated:** 2026-10-11
**Format:** Open Knowledge Format v0.2, cited as *OKF §n* (Google Cloud, *Open Knowledge Format*).
**Reference viewer:** `src/reference_agent/viewer/` in the OKF repository, read at its `main` branch on 2026-10-11 ("Open Knowledge Format").

Statements marked **PROPOSED** haven't been decided and are listed in §11.

---

## 1. Purpose

`okf-viz` turns the files of an OKF bundle into one self-contained HTML file that shows the bundle as a graph and lets a reader browse it. It is a port of the OKF reference viewer with three properties the reference doesn't have: it runs without Python or a filesystem, its output is deterministic, and it treats bundle text as untrusted.

It reads OKF. It doesn't write or validate bundles, call a model, or serve anything.

## 2. Rules that must not regress

1. **The same input produces the same bytes,** for a given version of this package.
2. **No text from a bundle is ever interpreted as HTML or script** by a generated viewer (§6).
3. **The core has no dependency on Node, a filesystem or the network.** It takes strings and returns a string.
4. **A generated viewer sends no bundle content anywhere.** Its only network requests are for the two pinned libraries (§5.3).
5. **Any conformant OKF bundle renders.** Unknown types, unknown keys, missing optional fields and broken links never cause a failure (OKF §11).
6. **A reader of the reference viewer loses nothing.** Every feature in §5.1 is present.

## 3. Interface

### 3.1 Library

```ts
type Files = Record<string, string> | Iterable<readonly [path: string, content: string]>;

generateViewer(input: {
  name: string;                 // shown in the header
  files: Files;                 // paths relative to the bundle root, '/' separated
  options?: Options;
}): Result;

generateRepoViewer(input: {
  name: string;
  bundles: Array<{ slug: string; title: string; root: string; files: Files }>;
  options?: Options;
}): Result;

buildGraph(files: Files, options?: Options): Graph;     // §4, for callers that want the data only

type Options = {
  palette?: Record<string, string>;   // type name → colour, overriding §5.2
  assetBase?: string;                 // prefix for relative image paths; default '' (§5.4)
};

type Result = { html: string; stats: { concepts: number; edges: number; bytes: number } };
```

- Only `.md` files are read. Other files in `files` are ignored, so a caller can pass a whole directory listing.
- `index.md` and `log.md` aren't concepts (OKF §3.1) and aren't shown as nodes.
- A `.md` file without parseable frontmatter is skipped, as in the reference viewer, and counted in `stats`. It is not an error.
- The functions don't throw on bundle content. They throw only on a malformed call, such as two files with the same path.

### 3.2 Command line

A thin wrapper for Node, mirroring the reference command's flags:

```
okf-viz --bundle <dir> [--out <file>] [--name <text>]
okf-viz --repo <dir> --bundles <root>[,<root>…] [--out <file>] [--name <text>]
```

`--out` defaults to `<dir>/viz.html`, and `--name` to the directory's name.

### 3.3 Distribution

One ESM package with type declarations. The viewer's template, stylesheet and script are compiled into it as strings, so nothing is read at run time.

**PROPOSED:** published to npm as `okf-viz`. Until then a consumer depends on a tagged commit of this repository.

## 4. Data embedded in the viewer

The generator embeds one JSON object. Its shape is the reference viewer's, with additions marked **+**.

```ts
type Graph = {
  format: 1;                                  // + version of this shape
  generator: string;                          // + "okf-viz/<version>"
  nodes: Array<{ data: Node }>;
  edges: Array<{ data: { id: string; source: string; target: string } }>;
  bodies: Record<string, string>;             // concept ID → markdown body
  types: string[];                            // sorted
  palette: Record<string, string>;            // type → colour
  bundles?: Array<{ slug: string; title: string }>;   // + repo viewer only
};

type Node = {
  id: string;                // concept ID: path without '.md' (OKF §2)
  label: string;             // title, or the ID
  type: string;              // 'Unknown' when absent
  description: string;
  resource: string;
  tags: string[];
  status: string;            // 'stable' when absent (OKF §5.4)
  generated: { by?: string; at?: string };
  verified: Array<{ by?: string; at?: string }>;   // a bare mapping becomes a one-element list (OKF §5.2)
  stale_after: string;
  sources: Array<Record<string, unknown>>;
  trust_tier: 'unverified' | 'machine-confirmed' | 'human-reviewed';   // OKF §5.3
  stale: boolean;            // see §4.2
  color: string;
  size: number;              // 30 + min(60, floor(body length / 200))
  bundle?: string;           // + repo viewer only: the bundle's slug
};
```

### 4.1 Edges

An edge is drawn from concept A to concept B when A's body contains a markdown link to B's file.

- Relative links are resolved against A's directory. Bundle-absolute links, which begin with `/`, are resolved against the bundle root. OKF supports both (OKF §6.1).
- A fragment after `.md` is ignored. Links to files outside the bundle, to missing concepts, and from a concept to itself draw no edge.
- One edge per ordered pair, however many times A links to B.

The reference generator draws edges for relative links only and skips `/`-absolute ones, although its browser script navigates them. Drawing both is a deliberate difference.

In the repo viewer, concept IDs are prefixed with the bundle's slug, and a link is resolved inside its own bundle. A link that leaves its bundle and lands on a concept of another bundle in the same repo draws an edge.

### 4.2 Staleness and time

A concept is stale when the current time is at or after its `stale_after` (OKF §5.5). The reference generator decides that at generation time, which would make output depend on when it ran.

Here the generator writes `stale: false` always and embeds `stale_after`; **the viewer decides staleness in the browser, at view time.** This keeps the output deterministic and makes the badge correct on the day the file is opened, not the day it was built.

### 4.3 Ordering

Nodes are sorted by ID, edges by source then target, `types` and the keys of `bodies` and `palette` alphabetically. Object keys are written in the order shown in §4. Strings are compared by code point.

## 5. The viewer

### 5.1 Features kept from the reference viewer

- A graph of every concept, nodes coloured by type and sized by body length, with a directed edge per link.
- Layouts: cose, concentric, breadth-first, circle, grid. A reset button.
- Search over title, concept ID and tags. A type filter.
- A detail panel: type, title, ID, badges for trust tier, status and staleness, then description, resource, tags, `generated`, `verified`, `sources`, and the rendered body.
- Links between concepts navigate inside the viewer.
- A "Cited by" list of concepts that link to the selected one.

### 5.2 Changes to what a reader sees

| Change | Why |
|---|---|
| A colour for every type | The reference palette names three types and paints the rest grey. Here a type without a fixed colour gets one chosen by hashing its name into a fixed palette, so it is stable across runs and bundles |
| Images in a body are shown | §5.4 |
| A source whose `resource` is another concept links to it inside the viewer | OKF treats that as lineage (OKF §5.1) |
| Repo viewer: a bundle filter, and nodes labelled with their bundle | §3.1 |
| The header shows the generator version | To tell which version built a committed file |

### 5.3 Libraries

Cytoscape.js draws the graph and marked renders markdown, loaded from the jsDelivr CDN as in the reference viewer. Each is pinned to an exact version and carries a Subresource Integrity hash, so a changed file at the CDN doesn't run.

The viewer needs a network connection to load them. Opened offline it shows a message saying so, not a blank page. Inlining the libraries was considered and rejected: it adds their full size to every generated file.

The versions start at the reference viewer's (Cytoscape 3.28.1, marked 12.0.0) and are raised deliberately, as a change to this package.

### 5.4 Images

A body's image with a relative path is shown, resolved against the concept's directory and prefixed with `assetBase`, so that a viewer at the bundle root finds the bundle's own image files. An image with an absolute URL isn't loaded; it is shown as a link (§6).

## 6. Bundle text is untrusted

A bundle's titles, descriptions, bodies and frontmatter values can derive from documents the bundle's maintainer didn't write. The reference viewer passes a body through `marked.parse` and assigns the result to `innerHTML`, and writes the embedded JSON into a script element as is. Both let bundle text run script. This package guarantees the following.

| Guarantee | How |
|---|---|
| Raw HTML in a body is displayed as text | marked is configured so that HTML tokens are escaped, not passed through |
| Frontmatter values are displayed as text | Written with `textContent`, never `innerHTML` |
| A link goes only to an `https:` URL or to a concept in the viewer | Every other scheme, including `javascript:`, `data:` and `vbscript:`, is removed from the link, leaving its text |
| An image loads only from a relative path | An absolute image URL becomes a link, so opening a viewer doesn't contact a server the bundle names |
| Bundle text can't end the script element that holds it | `<`, `>`, `&`, U+2028 and U+2029 are written as `\u` escapes in the embedded JSON |
| Nothing injected can run even if a rule above fails | A Content-Security-Policy in the file allows script only from the two pinned library URLs and the viewer's own inline script, by hash; allows no `eval`; no frames, objects or form targets; no connections; images only from relative paths |
| A link to another site doesn't hand it the viewer | `rel="noopener noreferrer"` on every external link |

The policy is a `<meta>` element, so it applies when the file is opened from disk.

## 7. Determinism

Output depends only on the input and this package's version.

- No clock, no random numbers, no locale-dependent comparison, no dependence on the order files were passed in.
- Line endings in bodies are normalized to LF before embedding.
- A new version of this package may change the bytes for the same input. A consumer that commits viewers pins the version and regenerates them when it upgrades.

## 8. Compatibility with the reference viewer

| Aspect | Reference | okf-viz |
|---|---|---|
| Embedded data shape | §4 without **+** fields | A superset |
| Concepts shown | Every `.md` except `index.md` that parses | The same, except `log.md` is excluded explicitly |
| Edges | Relative links only | Relative and `/`-absolute |
| `stale` | Decided at generation | Decided at view time |
| Body rendering | Unsanitized | §6 |
| Unknown-type colour | Grey | Stable colour per type |

For a bundle with no `/`-absolute links, the nodes and edges equal the reference generator's.

## 9. Tests

| # | Test |
|---|---|
| T1 | Golden files: fixture bundles produce byte-identical viewers |
| T2 | Passing the same files in a different order produces identical bytes |
| T3 | For each example bundle in the OKF repository, the nodes and edges equal those from the reference generator, apart from the differences in §8 |
| T4 | In a headless browser, a bundle whose bodies, titles, descriptions, tags and source fields contain a script element, an event-handler attribute, a `javascript:` link, a remote image and a `</script>` sequence runs no script and makes no request other than for the two libraries |
| T5 | The same bundle with the sanitizing steps disabled is still blocked by the Content-Security-Policy |
| T6 | The package imports and generates a viewer in a Workers runtime, with no Node compatibility flag |
| T7 | A bundle with missing frontmatter, unknown types, broken links and a bare `verified` mapping renders without error |
| T8 | A concept past its `stale_after` shows the stale badge with the browser clock after that instant and not before it |
| T9 | In a repo viewer, concepts with the same ID in two bundles are distinct nodes, and the bundle filter shows each |

## 10. Out of scope

- Editing a bundle, or writing anything back.
- Validating conformance. A viewer shows what it is given.
- Running or attesting an Attested Computation (OKF §10). Such concepts are shown like any other.
- A hosted viewer or a server.

## 11. Open questions

| # | Question | Proposal |
|---|---|---|
| V1 | Is the package published to npm, and under what name? (§3.3) | Yes, as `okf-viz`, once T1 to T7 pass |
| V2 | Should the hardening in §6 be offered upstream to the OKF reference viewer? | Yes: open an issue describing the unsanitized rendering, privately if the project has a security contact |
| V3 | Should the repo viewer draw the bundles as separate clusters or as one graph? | One graph, filterable by bundle |

## Works Cited

Google Cloud. *Open Knowledge Format*. Version 0.2, GitHub, github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md. Accessed 11 Oct. 2026.

"Open Knowledge Format." *GitHub*, Google Cloud, github.com/GoogleCloudPlatform/open-knowledge-format. Accessed 11 Oct. 2026.
