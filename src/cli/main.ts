import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { VERSION } from "../generated/assets.js";
import { INLINE_LIBRARIES } from "../generated/libraries.js";
import { generateRepoViewer, generateViewer } from "../index.js";
import type { Options, RepoBundle, Result } from "../types.js";
import { walk } from "./walk.js";

const USAGE = `Usage:
  okf-viz --bundle <dir> [--out <file>] [--name <text>] [--libraries cdn|inline]
  okf-viz --repo <dir> --bundles <root>[,<root>…] [--out <file>] [--name <text>] [--libraries cdn|inline]

Writes a self-contained HTML viewer for an Open Knowledge Format bundle, or
one viewer over several bundles of a repository.

  --bundle <dir>     the bundle's root directory
  --repo <dir>       a repository's root directory
  --bundles <roots>  the bundles' roots, relative to the repository's
  --out <file>       where to write the viewer (default: <dir>/viz.html)
  --name <text>      the name the viewer shows (default: the directory's name)
  --libraries <how>  cdn: the viewer loads Cytoscape.js and marked from jsDelivr,
                     and needs a network connection (default)
                     inline: the viewer carries them, loads nothing, and is
                     about 400 kB larger
  -h, --help         show this
  -V, --version      show the version
`;

export type Output = { stdout(text: string): void; stderr(text: string): void };

/** A mistake in how the command was called: reported with the usage. */
class UsageError extends Error {}

/** Anything else the user can put right: reported on its own. */
class Failure extends Error {}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function requireDirectory(path: string): void {
  if (!isDirectory(path)) throw new Failure(`${path} isn't a directory`);
}

/**
 * The bundles of a repository, from the roots given to --bundles. A bundle's
 * slug is the last segment of its root; roots that end in the same segment
 * each take their whole root, with '/' replaced by '-' (SPEC §3.2).
 */
function repoBundles(repo: string, roots: string[]): RepoBundle[] {
  const normalized = roots.map((given) => {
    const path = resolve(repo, given);
    const root = relative(repo, path).split(sep).join("/");
    if (root.startsWith("..") || resolve(repo, root) !== path) {
      throw new Failure(`The bundle root ${given} is outside ${repo}`);
    }
    requireDirectory(path);
    return { root, path };
  });

  const last = (root: string) =>
    root === "" ? basename(repo) : (root.split("/").at(-1) as string);
  const count = new Map<string, number>();
  for (const { root } of normalized) count.set(last(root), (count.get(last(root)) ?? 0) + 1);

  return normalized.map(({ root, path }) => {
    const slug = count.get(last(root)) === 1 ? last(root) : root.split("/").join("-");
    return { slug, title: slug, root, files: walk(path) };
  });
}

/** Runs the command. Returns its exit status: 0, 1 for a failure, 2 for misuse. */
export function run(argv: string[], output: Output): number {
  try {
    let values: { [name: string]: string | boolean | undefined };
    try {
      ({ values } = parseArgs({
        args: argv,
        strict: true,
        allowPositionals: false,
        options: {
          bundle: { type: "string" },
          repo: { type: "string" },
          bundles: { type: "string" },
          out: { type: "string" },
          name: { type: "string" },
          libraries: { type: "string" },
          help: { type: "boolean", short: "h" },
          version: { type: "boolean", short: "V" },
        },
      }));
    } catch (error) {
      throw new UsageError((error as Error).message);
    }

    if (values.help) {
      output.stdout(USAGE);
      return 0;
    }
    if (values.version) {
      output.stdout(`${VERSION}\n`);
      return 0;
    }

    const bundle = values.bundle as string | undefined;
    const repo = values.repo as string | undefined;
    const bundles = values.bundles as string | undefined;
    if ((bundle === undefined) === (repo === undefined)) {
      throw new UsageError("Give either --bundle or --repo");
    }
    if (repo !== undefined && bundles === undefined) throw new UsageError("--repo needs --bundles");
    if (bundle !== undefined && bundles !== undefined) {
      throw new UsageError("--bundles goes with --repo, not --bundle");
    }

    const how = (values.libraries as string | undefined) ?? "cdn";
    if (how !== "cdn" && how !== "inline") {
      throw new UsageError(`--libraries is cdn or inline, not ${how}`);
    }
    const options: Options = { libraries: how === "inline" ? INLINE_LIBRARIES : "cdn" };

    const dir = resolve((bundle ?? repo) as string);
    const name = (values.name as string | undefined) ?? basename(dir);
    const out = resolve((values.out as string | undefined) ?? join(dir, "viz.html"));

    let result: Result;
    if (bundle !== undefined) {
      requireDirectory(dir);
      result = generateViewer({ name, files: walk(dir), options });
    } else {
      const roots = (bundles as string)
        .split(",")
        .map((root) => root.trim())
        .filter((root) => root !== "");
      if (roots.length === 0) throw new UsageError("--bundles names no bundle");
      requireDirectory(dir);
      try {
        result = generateRepoViewer({ name, bundles: repoBundles(dir, roots), options });
      } catch (error) {
        // A slug the library refuses, or the same root given twice.
        if (error instanceof TypeError) throw new Failure(error.message);
        throw error;
      }
    }

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, result.html);

    const { concepts, edges, bytes, skipped } = result.stats;
    output.stderr(`Wrote ${concepts} concept(s), ${edges} edge(s), ${bytes} bytes → ${out}\n`);
    if (skipped > 0) {
      output.stderr(`Skipped ${skipped} file(s) whose frontmatter couldn't be read\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      output.stderr(`okf-viz: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    // A Failure, or the filesystem refusing: a file that can't be read, an
    // output path that is a directory. Node marks those with a `code`.
    if (error instanceof Failure || typeof (error as { code?: unknown }).code === "string") {
      output.stderr(`okf-viz: ${(error as Error).message}\n`);
      return 1;
    }
    throw error;
  }
}
