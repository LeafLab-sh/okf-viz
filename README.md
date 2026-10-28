# okf-viz

Generates a single-file, interactive HTML viewer for an [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/open-knowledge-format) bundle: a graph of the bundle's concepts and the links between them, with each concept's frontmatter, trust state and rendered body beside it.

It is a TypeScript port of the OKF reference viewer, built to run anywhere JavaScript does (Cloudflare Workers, Node, a browser), to produce the same bytes for the same input, and to be safe to open on bundles whose text you didn't write.

## Status

Implemented to [`SPEC.md`](SPEC.md). Distributed through GitHub Packages as `@leaflab-sh/okf-viz`.

## Install

GitHub Packages is an npm registry that asks for a token even to read. Point the `@leaflab-sh` scope at it in `.npmrc`, with a token that has the `read:packages` scope:

```ini
@leaflab-sh:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
pnpm add @leaflab-sh/okf-viz
```

## Why a port

The reference viewer is a Python command (`reference_agent visualize`) that writes `viz.html` next to a bundle. That is the right shape for a proof of concept and the wrong one for three cases this package is for:

| Need | Reference viewer | okf-viz |
|---|---|---|
| Run where there is no Python or filesystem, such as a Worker | Reads a directory from disk | Takes files as data, returns a string |
| Commit the output and review its diff | Output order follows the filesystem walk | Deterministic: same files, same bytes |
| Open a viewer for a bundle built from documents you don't control | Renders page markdown as HTML unsanitized | Escapes raw HTML, restricts link schemes, ships a Content-Security-Policy |
| View several bundles from one repository together | One bundle per file | A repo viewer over many bundles |

Everything a reader sees in the reference viewer is kept: the graph, the detail panel, trust badges, sources, backlinks, search, the type filter and the layouts.

## Use

### Library

```ts
import { generateViewer } from "@leaflab-sh/okf-viz";

const { html, stats } = generateViewer({
  name: "Team knowledge",
  files: { "index.md": "…", "topics/release-workflow.md": "…" },
});
```

`files` maps each path, relative to the bundle root and `/`-separated, to the file's text. Files that aren't `.md` are ignored, so a whole directory listing can be passed. `stats` reports the concepts, edges and bytes written, and how many files were skipped because their frontmatter couldn't be read.

The library imports nothing from Node and reads nothing at run time, so the same call works in a Worker:

```ts
export default {
  async fetch(): Promise<Response> {
    const { html } = generateViewer({ name: "Team knowledge", files: await loadBundle() });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
```

Several bundles of one repository can share a viewer. Each concept is labelled with its bundle, and a link from one bundle into another is drawn:

```ts
import { generateRepoViewer } from "@leaflab-sh/okf-viz";

const { html } = generateRepoViewer({
  name: "All knowledge",
  bundles: [
    { slug: "sales", title: "Sales", root: "bundles/sales", files: salesFiles },
    { slug: "finance", title: "Finance", root: "bundles/finance", files: financeFiles },
  ],
});
```

`buildGraph(files)` returns the graph a viewer embeds, for callers that want the data alone.

| Option | Meaning |
|---|---|
| `palette` | Type name to colour, overriding the built-in colours |
| `assetBase` | Put before the path of each image in a body. A relative prefix, or an `https:` URL when the bundle's images are served from somewhere other than the viewer |
| `libraries` | Where the viewer gets Cytoscape.js and marked: `"cdn"`, the default, or `inlineLibraries` to write them into the viewer. See below |

### A viewer that needs no network

By default a viewer is small and loads its two libraries from a CDN. To get one that opens with no connection and contacts nobody, have it carry them:

```ts
import { generateViewer } from "@leaflab-sh/okf-viz";
import { inlineLibraries } from "@leaflab-sh/okf-viz/inline";

const { html } = generateViewer({ name, files, options: { libraries: inlineLibraries } });
```

| | `libraries: "cdn"` (default) | `libraries: inlineLibraries` |
|---|---|---|
| Size of each viewer | Tens of kilobytes | About 400 kB more |
| Opens offline | No | Yes |
| Requests | The two libraries, from jsDelivr | None |
| Size added to your own bundle | Nothing | About 400 kB, from the `inline` entry |

The libraries are in an entry of their own so that a caller who doesn't inline them, a Worker for one, doesn't carry them.

### Command line

```sh
okf-viz --bundle ./knowledge                          # writes ./knowledge/viz.html
okf-viz --bundle ./knowledge --out site/graph.html --name "Team knowledge"
okf-viz --repo . --bundles bundles/sales,bundles/finance   # writes ./viz.html
okf-viz --bundle ./knowledge --libraries inline        # a viewer that needs no network
```

The command reads only `.md` files. It doesn't follow symbolic links, and it skips `node_modules` and directories whose name begins with a dot.

## What to know before relying on it

- **A viewer needs a network connection, unless it carries its libraries.** By default it loads Cytoscape.js and marked from the jsDelivr CDN, each pinned to an exact version and checked against a hash, and opened offline it says so. It makes no other request, and sends nothing from the bundle anywhere.
- **Pin the version if you commit viewers.** The same input gives the same bytes for a given version of this package. A new version may change them, so regenerate committed viewers when you upgrade.
- **Staleness is decided when the file is opened.** A concept past its `stale_after` is marked by the reader's clock, not the clock of the machine that generated the file. A `stale_after` with a date but no time and offset is never stale, as in the reference viewer.
- **Images load only from the bundle.** An image with a relative path is shown. An image with an absolute URL becomes a link, so that opening a viewer doesn't contact a server the bundle names.
- **Links go only to concepts or `https:` URLs.** A link with any other scheme is shown as its text.
- **The policy can't stop another page from framing a viewer.** It is a `<meta>` element, which can't carry `frame-ancestors`. A host that needs that sends the header itself.

[`SPEC.md`](SPEC.md) §8 lists every difference from the reference viewer, and §6 what a viewer guarantees about bundle text.

## Development

Recipes are in the [`justfile`](justfile); each wraps a `pnpm` script.

```sh
just install        # dependencies, from the lockfile
just browsers       # the browsers the browser tests drive
just check          # lint, typecheck, unit tests, the Workers test and the browser tests
just update-golden  # rewrite the golden viewers after changing the viewer
```

### Git hooks

`pnpm install` sets up the hooks in `.husky/`, so everyone who works on the repository runs the same ones.

- **Before a commit**, the staged files are formatted and linted with Biome, and trailing spaces and blank lines at the end of a file are stripped from them. Markdown keeps the spaces at the end of a line, where two of them are a line break, and `test/fixtures/` is left alone, since its files are compared byte for byte.
- **A commit's message** must follow [Conventional Commits](https://www.conventionalcommits.org): `feat: …`, `fix: …`, `docs: …`, `test: …`, `build: …`, `ci: …` and so on.

`just format` formats and fixes the whole repository, and `just lint` checks it without changing anything.

### CI is the reference

A change is right when it passes CI, whatever it did on the machine it was written on. CI runs on a clean checkout, on Linux and Windows, and repeats everything the hooks check, since a hook can be skipped: formatting, lint, trailing whitespace and the commit messages of a pull request, then the type check and every test.

So that a local run agrees with it, the versions are pinned in the repository and CI reads them from there: Node in `.node-version`, pnpm in `package.json`, and every tool, Biome's formatter included, in `pnpm-lock.yaml`. Install with `just install`, which keeps to the lockfile.

The viewer's template and stylesheet are formatted and linted like the rest. In the template, the placeholders for the stylesheet, the data and the script are written as a comment, a string and a comment, so that the file is valid as it stands; the build turns each into the bare placeholder.

### Releases

Nobody sets the version or writes the changelog by hand. [release-please](https://github.com/googleapis/release-please) reads the commit messages on `main` and keeps a pull request open, titled `chore(main): release x.y.z`, that holds the next version in `package.json` and its entry in `CHANGELOG.md`. A `fix` commit makes it a patch release, a `feat` a minor one, and a breaking change a major one, or a minor one while the version is below 1.0.0.

Merging that pull request is the release. The Release workflow then tags the commit, writes the GitHub release, and publishes the package to GitHub Packages.

### Automation App

GitHub starts no workflow for anything done with a workflow's own token. Two things here are done by workflows and need other workflows to run on the result: release-please opens the release pull request, which needs CI, and Dependabot's pull requests are merged by auto-merge, which has to start the release workflow. With the workflow's own token, neither happens.

So both workflows act as the org's GitHub App, `leaflab-automation`. Each takes a token from the App that lasts an hour and reaches this repository alone, so no person's token is stored anywhere. Dependabot's pull requests go through the org's [shared workflow](https://github.com/LeafLab-sh/shared-workflows), which approves them and turns on auto-merge.

The App needs at least these repository permissions:

| Permission | Access | For |
|---|---|---|
| Contents | Read and write | The release branch, tag and GitHub release |
| Pull requests | Read and write | Opening the release pull request; approving Dependabot's and turning on their auto-merge |
| Issues | Read and write | The labels release-please puts on its pull request |

What the workflows need is set once for the org, under the org's *Settings → Secrets and variables*: the variable `LEAFLAB_AUTOMATION_CLIENT_ID`, the App's client ID, and the secret `LEAFLAB_AUTOMATION_PRIVATE_KEY`, a private key generated for it. The secret is set twice, as an **Actions** secret and as a **Dependabot** secret, since a workflow started by Dependabot's pull request is given only the latter.

Releases need the App. The org lets only `leaflab-automation` create `v*` tags, so the Release workflow has no fallback to the workflow's own token and fails without the App's key. Dependabot's auto-merge still works without it, but the release pull request then picks up a Dependabot update only at the next push to `main` that isn't Dependabot's.

### Notes

- The viewer's template, stylesheet and browser script are in `src/viewer/`. `just assets` compiles them into `src/generated/assets.ts` with the hashes the Content-Security-Policy names, so a change to any of them changes the policy and the golden files with it.
- The golden files in `test/fixtures/golden/` are compared byte for byte. Review their diff like code.
- `test/fixtures/okf/` holds the OKF repository's example bundles, and `test/fixtures/okf-reference/` the graph its reference generator builds for each. `just vendor-okf` refreshes both from the commit `SPEC.md` names; it needs the GitHub CLI, `tar`, and Python with PyYAML.
- A source file that needs a line separator, a byte-order mark or a control character writes it as an escape sequence, never as the character itself: an invisible character in a pattern or a string is a bug nobody can see.

## Relationship to OKF

This project is not affiliated with Google or the OKF project. It consumes the format as published and derives its viewer from the reference implementation under that implementation's licence; see [`NOTICE`](NOTICE).

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
