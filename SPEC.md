# okf-viz — Specification

**Status:** Draft 2. Implemented: tests T1 to T10 pass.
**Last updated:** 2026-10-11
**Format:** Open Knowledge Format v0.2, cited as *OKF §n* (Google Cloud, *Open Knowledge Format*).
**Reference viewer:** `src/reference_agent/viewer/` in the OKF repository, read at commit `ad30107c31c06aec8a7d5636e0d1058118604e6f`, the head of `main` on 2026-10-11 ("Open Knowledge Format").

Statements marked **PROPOSED** haven't been decided and are listed in §11. None is at present.

---

## 1. Purpose

`okf-viz` turns the files of an OKF bundle into one self-contained HTML file that shows the bundle as a graph and lets a reader browse it. It is a port of the OKF reference viewer with three properties the reference doesn't have: it runs without Python or a filesystem, its output is deterministic, and it treats bundle text as untrusted.

It reads OKF. It doesn't write or validate bundles, call a model, or serve anything.

## 2. Rules that must not regress

1. **The same input produces the same bytes,** for a given version of this package.
2. **No text from a bundle is ever interpreted as HTML or script** by a generated viewer (§6).
3. **The core has no dependency on Node, a filesystem or the network.** It takes strings and returns a string.
4. **A generated viewer sends no bundle content anywhere.** Its only network requests are for the two pinned libraries, and it makes none at all when it carries them (§5.3).
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
  libraries?: 'cdn' | InlineLibraries; // where the viewer's two libraries come from; default 'cdn' (§5.3)
};

type Result = {
  html: string;
  stats: { concepts: number; edges: number; bytes: number; skipped: number };
};
```

- Only `.md` files are read. Other files in `files` are ignored, so a caller can pass a whole directory listing.
- `index.md` and `log.md` aren't concepts and aren't shown as nodes, at any depth of the bundle (OKF §3.1).
- A `.md` file with no frontmatter block is a concept of type `Unknown` whose whole text is its body, as in the reference viewer.
- A `.md` file whose frontmatter block is unterminated, isn't valid YAML, or isn't a mapping is skipped, as in the reference viewer, and counted in `stats.skipped`. It is not an error.
- The functions don't throw on bundle content. They throw only on a malformed call:
  - two files with the same path;
  - a path that begins with `/`, has an empty, `.` or `..` segment, or contains `\` or U+0000;
  - an `assetBase` that is neither a relative prefix nor an `https:` URL (§5.4);
  - a `libraries` that is neither `'cdn'` nor libraries that can be inlined (§5.3);
  - in the repo viewer, a `slug` that doesn't match `[A-Za-z0-9._-]+`, or two bundles with the same `slug` or the same `root`.

### 3.2 Command line

A thin wrapper for Node, mirroring the reference command's flags:

```
okf-viz --bundle <dir> [--out <file>] [--name <text>] [--libraries cdn|inline]
okf-viz --repo <dir> --bundles <root>[,<root>…] [--out <file>] [--name <text>] [--libraries cdn|inline]
```

`--out` defaults to `<dir>/viz.html`, `--name` to the directory's name, and `--libraries` to `cdn` (§5.3).

With `--repo`, each root is a path relative to `<dir>`. A bundle's slug is the last segment of its root; if two roots end in the same segment, each of those takes its whole root with `/` replaced by `-`. A bundle's title is its slug.

The command reads only `.md` files. It doesn't follow symbolic links, and it skips `node_modules` and directories whose name begins with a dot.

### 3.3 Distribution

One ESM package with type declarations. The viewer's template, stylesheet and script are compiled into it as strings, so nothing is read at run time.

Published to GitHub Packages, the npm registry of the LeafLab organization, as `@leaflab-sh/okf-viz`: GitHub Packages requires the owner's name as the scope. A release is made by merging the pull request that release-please keeps open, which sets the version and the changelog from the commit messages on `main`; the package is then tagged and published. Installing the repository as a Git dependency isn't supported: `dist/` isn't committed and nothing builds it on install.

## 4. Data embedded in the viewer

The generator embeds one JSON object. Its shape is the reference viewer's, with additions marked **+**.

The object is written into a `<script type="application/json">` element and read by the viewer with `JSON.parse`. The reference viewer assigns it to `window.BUNDLE` in an executable script. A data block is never executed, and it leaves the viewer's own script identical in every generated file, so the Content-Security-Policy can name that script by a hash fixed when this package is built (§6).

```ts
type Graph = {
  format: 1;                                  // + version of this shape
  generator: string;                          // + "okf-viz/<version>"
  nodes: Array<{ data: Node }>;
  edges: Array<{ data: { id: string; source: string; target: string } }>;
  bodies: Record<string, string>;             // concept ID → markdown body
  types: string[];                            // sorted
  palette: Record<string, string>;            // type → colour
  bundles?: Array<{ slug: string; title: string; root: string }>;   // + repo viewer only
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
- A link is recognized as the reference generator recognizes it: `](`, then a target without whitespace or `)` that ends in `.md`, then an optional fragment, then `)`. A link inside a code span counts, as it does there.

The reference generator draws edges for relative links only and skips `/`-absolute ones, although its browser script navigates them. Drawing both is a deliberate difference.

An edge's `id` is its source, U+0000, then its target. The reference joins them with `__`, which gives two edges the same `id` when a concept ID contains `__`, and can give an edge the `id` of a node. Cytoscape refuses duplicate IDs, so such a bundle wouldn't render. U+0000 can't occur in a path (§3.1).

In the repo viewer, concept IDs are prefixed with the bundle's slug, and a link is resolved inside its own bundle. A link that leaves its bundle and lands on a concept of another bundle in the same repo draws an edge. Only a relative link can leave its bundle, since a `/`-absolute one is anchored at its bundle's root. Where one bundle's root lies inside another's, the link lands in the innermost bundle that has a concept there. A bundle's `root` is embedded so that the viewer resolves links the same way and finds each bundle's images under `assetBase`.

### 4.2 Staleness and time

A concept is stale when the current time is at or after its `stale_after` (OKF §5.5). The reference generator decides that at generation time, which would make output depend on when it ran.

Here the generator writes `stale: false` always and embeds `stale_after`; **the viewer decides staleness in the browser, at view time.** This keeps the output deterministic and makes the badge correct on the day the file is opened, not the day it was built.

As in the reference, a `stale_after` counts only if it is an ISO 8601 date and time with an explicit offset, `Z` or `±hh:mm`. A date alone names a different instant in every timezone, so a concept with one is never stale.

### 4.3 Ordering

Nodes are sorted by ID, edges by source then target, `types` and the keys of `bodies` and `palette` alphabetically. Object keys are written in the order shown in §4. Strings are compared by code point.

One exception follows from JSON being written by the JavaScript engine: a key that is a whole number, such as a concept whose ID is `2024`, is written before the other keys of its object, in numeric order. That order doesn't depend on the input's order either.

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
| A source whose `resource` is another concept links to it inside the viewer. Its path is tried from the concept's directory, then from the bundle root | OKF treats that as lineage and calls the path bundle-relative (OKF §5.1); its example bundles write it from the root without a leading `/` |
| Repo viewer: a bundle filter, and nodes labelled with their bundle | §3.1 |
| The header shows the generator version | To tell which version built a committed file |
| Search, the type filter and the bundle filter combine | In the reference, using one undoes the other's dimming |

### 5.3 Libraries

Cytoscape.js draws the graph and marked renders markdown. Where a viewer gets them is the caller's choice, by the `libraries` option:

| `libraries` | The viewer | Its size | Needs a network connection |
|---|---|---|---|
| `'cdn'`, the default | Loads them from the jsDelivr CDN, as the reference viewer does. Each is pinned to an exact version and carries a Subresource Integrity hash, so a changed file at the CDN doesn't run | Tens of kilobytes | Yes. Opened offline it shows a message saying so, not a blank page |
| `inlineLibraries` | Carries them, in two script elements of its own, each named in the Content-Security-Policy by its hash. It requests nothing, from anywhere | About 400 kB more | No |

The default is the CDN because a viewer is often committed beside its bundle, and 400 kB in every one adds up. A viewer that must open with no network, or that must not contact a third party, carries them.

`inlineLibraries` is exported from a second entry of the package, `@leaflab-sh/okf-viz/inline`, and passed as the option. It isn't part of the main entry, so that a caller who uses the CDN, a Worker for one, doesn't carry the libraries in its own bundle. Each library is the file npm published, licence notice included, with its SHA-256.

A `libraries` value that is neither is a malformed call (§3.1), as is library code that couldn't be written inside a script element.

The versions start at the reference viewer's (Cytoscape 3.28.1, marked 12.0.0) and are raised deliberately, as a change to this package.

### 5.4 Images

A body's image with a relative path is shown, resolved against the concept's directory and prefixed with `assetBase`, so that a viewer at the bundle root finds the bundle's own image files. An image with an absolute URL isn't loaded; it is shown as a link (§6). An image whose path leaves the bundle is shown as its alternative text.

`assetBase` is either a relative prefix or an `https:` URL. When it is a URL, its origin is added to the image sources the Content-Security-Policy allows, so a viewer served from one place can show a bundle's images kept in another.

## 6. Bundle text is untrusted

A bundle's titles, descriptions, bodies and frontmatter values can derive from documents the bundle's maintainer didn't write. The reference viewer passes a body through `marked.parse` and assigns the result to `innerHTML`, and writes the embedded JSON into a script element as is. Both let bundle text run script. This package guarantees the following.

| Guarantee | How |
|---|---|
| Raw HTML in a body is displayed as text | marked is configured so that HTML tokens are escaped, not passed through |
| A rendered body holds only markdown's own elements | marked's output is parsed into an inert `<template>` and walked before it is shown: an element or attribute outside a fixed list is removed, leaving its text |
| Frontmatter values are displayed as text | Written with `textContent`, never `innerHTML` |
| A link goes only to an `https:` URL or to a concept in the viewer | Every other scheme, including `javascript:`, `data:` and `vbscript:`, is removed from the link, leaving its text |
| An image loads only from a relative path | An absolute image URL becomes a link, so opening a viewer doesn't contact a server the bundle names |
| Bundle text can't end the script element that holds it | `<`, `>`, `&`, U+2028 and U+2029 are written as `\u` escapes in the embedded JSON |
| Nothing injected can run even if a rule above fails | A Content-Security-Policy in the file allows script only from the two pinned library URLs, or by the hashes of the two libraries when the viewer carries them, and the viewer's own inline script, by hash; allows no `eval`; no frames, objects or form targets; no connections; images only from relative paths |
| A link to another site doesn't hand it the viewer | `rel="noopener noreferrer"` on every external link |

The policy is a `<meta>` element, so it applies when the file is opened from disk. A `<meta>` policy can't carry `frame-ancestors`, so it doesn't stop another page from framing a viewer; a host that needs that sends the header itself.

The first three rows are three layers: escaping in marked, the element list, and the policy. T4 tests them together and T5 tests the policy with the other two switched off.

A policy stops a page from running and loading things, not from navigating: a `<meta http-equiv="refresh">` that reached the page could still take the reader elsewhere. Only the first two layers stop that, so T5's bundle leaves it out and T4's includes it.

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
| Embedding | `window.BUNDLE` in an executable script | A JSON data block (§4) |
| Edge `id` | Source, `__`, target | Source, U+0000, target (§4.1) |
| Frontmatter scalars | YAML 1.1 without timestamps: `yes`, `no`, `on`, `off` are booleans, `010` is octal, `1:30` is sexagesimal | YAML 1.2 core schema: each of those is the text the author wrote |
| Duplicate frontmatter key | The last one wins | The same |
| Search and type filter | Each undoes the other | Combined |
| A link whose path is percent-encoded, such as `my%20file.md` | Matched against file names as written | Tried as written, then decoded, as a markdown renderer follows it |
| A link in a body, clicked | Only a `/`-absolute link navigates inside the viewer | Relative links do too |
| Graph element IDs | The concept's ID, which fails for a concept named `constructor` | The viewer gives Cytoscape IDs of its own |

For a bundle with no `/`-absolute or percent-encoded links and none of the YAML 1.1 scalars above, the nodes equal the reference generator's, and so do the edges apart from their `id`.

## 9. Tests

| # | Test |
|---|---|
| T1 | Golden files: fixture bundles produce byte-identical viewers |
| T2 | Passing the same files in a different order produces identical bytes |
| T3 | For each example bundle in the OKF repository, the nodes and edges equal those from the reference generator, apart from the differences in §8. The reference's side is what its generator builds for each bundle when run at the commit named at the top of this document. The `viz.html` files that repository commits aren't used: at that commit they are older than the generator beside them |
| T4 | In a headless browser, a bundle whose bodies, titles, descriptions, tags and source fields contain a script element, an event-handler attribute, a `javascript:` link, a remote image and a `</script>` sequence, and which has a concept and a type named `__proto__`, runs no script and makes no request other than for the two libraries |
| T5 | The same bundle with the sanitizing steps disabled is still blocked by the Content-Security-Policy |
| T6 | The package imports and generates a viewer in a Workers runtime, with no Node compatibility flag |
| T7 | A bundle with missing frontmatter, unknown types, broken links and a bare `verified` mapping renders without error |
| T8 | A concept past its `stale_after` shows the stale badge with the browser clock after that instant and not before it |
| T9 | In a repo viewer, concepts with the same ID in two bundles are distinct nodes, and the bundle filter shows each |
| T10 | A viewer that carries its libraries works with every request to another origin refused, makes no request at all, and passes T4 |

## 10. Out of scope

- Editing a bundle, or writing anything back.
- Validating conformance. A viewer shows what it is given.
- Running or attesting an Attested Computation (OKF §10). Such concepts are shown like any other.
- A hosted viewer or a server.

## 11. Open questions

| # | Question | Proposal |
|---|---|---|
| V1 | Is the package published, and under what name? (§3.3) | **Decided:** to GitHub Packages, as `@leaflab-sh/okf-viz` |
| V2 | Should the hardening in §6 be offered upstream to the OKF reference viewer? | **Decided:** no |
| V3 | Should the repo viewer draw the bundles as separate clusters or as one graph? | One graph, filterable by bundle |
## Works Cited

Google Cloud. *Open Knowledge Format*. Version 0.2, GitHub, github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md. Accessed 11 Oct. 2026.

"Open Knowledge Format." *GitHub*, Google Cloud, github.com/GoogleCloudPlatform/open-knowledge-format. Accessed 11 Oct. 2026.
