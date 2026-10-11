# okf-viz

Generates a single-file, interactive HTML viewer for an [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/open-knowledge-format) bundle: a graph of the bundle's concepts and the links between them, with each concept's frontmatter, trust state and rendered body beside it.

It is a TypeScript port of the OKF reference viewer, built to run anywhere JavaScript does (Cloudflare Workers, Node, a browser), to produce the same bytes for the same input, and to be safe to open on bundles whose text you didn't write.

## Status

**Specification only. Nothing is implemented yet.** The design is in [`SPEC.md`](SPEC.md).

## Why a port

The reference viewer is a Python command (`reference_agent visualize`) that writes `viz.html` next to a bundle. That is the right shape for a proof of concept and the wrong one for three cases this package is for:

| Need | Reference viewer | okf-viz |
|---|---|---|
| Run where there is no Python or filesystem, such as a Worker | Reads a directory from disk | Takes files as data, returns a string |
| Commit the output and review its diff | Output order follows the filesystem walk | Deterministic: same files, same bytes |
| Open a viewer for a bundle built from documents you don't control | Renders page markdown as HTML unsanitized | Escapes raw HTML, restricts link schemes, ships a Content-Security-Policy |
| View several bundles from one repository together | One bundle per file | A repo viewer over many bundles |

Everything a reader sees in the reference viewer is kept: the graph, the detail panel, trust badges, sources, backlinks, search, the type filter and the layouts.

## Planned use

```ts
import { generateViewer } from "okf-viz";

const { html } = generateViewer({
  name: "Team knowledge",
  files: { "index.md": "…", "topics/release-workflow.md": "…" },
});
```

```sh
npx okf-viz --bundle ./knowledge            # writes ./knowledge/viz.html
```

Neither works yet. See the status above.

## Relationship to OKF

This project is not affiliated with Google or the OKF project. It consumes the format as published and derives its viewer from the reference implementation under that implementation's licence; see [`NOTICE`](NOTICE).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
