// Copies the example bundles of the OKF repository, at the commit SPEC.md
// names, into test/fixtures/okf/, and the graph the reference generator builds
// for each, by running that generator, into test/fixtures/okf-reference/
// (SPEC §9, T3). The viz.html files the repository commits aren't used: at
// this commit they are older than the generator beside them.
//
// Run by hand when the pinned commit changes: `just vendor-okf`. It needs the
// GitHub CLI, tar, and Python with PyYAML. Its output is committed.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "GoogleCloudPlatform/open-knowledge-format";
const COMMIT = "ad30107c31c06aec8a7d5636e0d1058118604e6f";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundlesOut = join(root, "test/fixtures/okf");
const graphsOut = join(root, "test/fixtures/okf-reference");

// The archive is unpacked in a directory of its own, and only read from.
const work = mkdtempSync(join(tmpdir(), "okf-vendor-"));
try {
  const archive = join(work, "source.tar.gz");
  writeFileSync(
    archive,
    execFileSync("gh", ["api", `repos/${REPOSITORY}/tarball/${COMMIT}`], {
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const unpacked = join(work, "source");
  mkdirSync(unpacked);
  execFileSync("tar", ["-xzf", "source.tar.gz", "-C", "source", "--strip-components=1"], {
    cwd: work,
  });

  rmSync(bundlesOut, { recursive: true, force: true });
  rmSync(graphsOut, { recursive: true, force: true });
  mkdirSync(graphsOut, { recursive: true });

  const bundles = join(unpacked, "bundles");
  for (const bundle of readdirSync(bundles).sort()) {
    const from = join(bundles, bundle);
    let count = 0;
    for (const entry of readdirSync(from, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = join(entry.parentPath, entry.name);
      const to = join(bundlesOut, bundle, relative(from, file));
      mkdirSync(join(to, ".."), { recursive: true });
      cpSync(file, to);
      count++;
    }

    // -I keeps Python from loading code out of the unpacked archive's
    // directories other than the one named here.
    const graph = JSON.parse(
      execFileSync(
        "python",
        ["-I", join(root, "scripts/reference-graph.py"), join(unpacked, "src"), from],
        { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      ),
    );
    writeFileSync(join(graphsOut, `${bundle}.json`), `${JSON.stringify(graph)}\n`);
    console.log(
      `${bundle}: ${count} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
    );
  }
  writeFileSync(
    join(bundlesOut, "SOURCE.txt"),
    `The bundles here are copied from https://github.com/${REPOSITORY}\nat commit ${COMMIT}, under the Apache License, Version 2.0.\nCopyright 2026 Google LLC. See NOTICE at the root of this repository.\n`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
