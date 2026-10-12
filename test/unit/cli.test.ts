import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run } from "../../src/cli/main.js";
import { walk } from "../../src/cli/walk.js";
import { VERSION } from "../../src/generated/assets.js";
import { generateRepoViewer, generateViewer } from "../../src/index.js";
import { inlineLibraries } from "../../src/inline.js";
import { fixturePath, readBundle, unversioned } from "../helpers/fixtures.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "okf-viz-cli-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function invoke(...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

const write = (path: string, content: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const doc = (body: string) => `---\ntype: T\n---\n\n${body}\n`;

describe("walk", () => {
  test("reads .md files at any depth, by '/'-separated path", () => {
    write("a.md", "A");
    write("deep/er/b.md", "B");
    write("deep/pic.png", "x");
    expect(walk(dir)).toEqual({ "a.md": "A", "deep/er/b.md": "B" });
  });

  test("skips node_modules and directories whose name begins with a dot", () => {
    write("a.md", "A");
    write("node_modules/pkg/readme.md", "x");
    write(".git/notes.md", "x");
    write("sub/.obsidian/x.md", "x");
    expect(Object.keys(walk(dir))).toEqual(["a.md"]);
  });

  test("doesn't follow symbolic links", ({ skip }) => {
    write("real/a.md", "A");
    mkdirSync(join(dir, "bundle"));
    writeFileSync(join(dir, "bundle/b.md"), "B");
    try {
      symlinkSync(join(dir, "real"), join(dir, "bundle/linked"), "junction");
      symlinkSync(join(dir, "real/a.md"), join(dir, "bundle/a-link.md"), "file");
    } catch {
      // Creating a file link needs a privilege on Windows; the directory
      // junction above doesn't.
      if (!existsSync(join(dir, "bundle/linked"))) skip();
    }
    expect(Object.keys(walk(join(dir, "bundle")))).toEqual(["b.md"]);
  });
});

describe("okf-viz --bundle", () => {
  test("writes viz.html in the bundle, named after its directory", () => {
    const bundle = join(dir, "knowledge");
    cpSync(fixturePath("edge"), bundle, { recursive: true });
    const { code, stderr } = invoke("--bundle", bundle);
    expect(code).toBe(0);
    const expected = generateViewer({ name: "knowledge", files: readBundle("edge") });
    expect(readFileSync(join(bundle, "viz.html"), "utf8")).toBe(expected.html);
    expect(stderr).toBe(
      `Wrote 4 concept(s), 4 edge(s), ${expected.stats.bytes} bytes → ${join(bundle, "viz.html")}\n` +
        "Skipped 2 file(s) whose frontmatter couldn't be read\n",
    );
  });

  test("takes --out and --name, and creates the output's directory", () => {
    write("b/a.md", doc("x"));
    const out = join(dir, "site/deep/graph.html");
    expect(invoke("--bundle", join(dir, "b"), "--out", out, "--name", "Team knowledge").code).toBe(
      0,
    );
    expect(readFileSync(out, "utf8")).toBe(
      generateViewer({ name: "Team knowledge", files: { "a.md": doc("x") } }).html,
    );
  });

  test("gives the same bytes for files with CRLF line endings", () => {
    const files = readBundle("minimal");
    for (const [path, content] of Object.entries(files)) {
      write(`lf/${path}`, content);
      write(`crlf/${path}`, content.replaceAll("\n", "\r\n"));
    }
    invoke("--bundle", join(dir, "lf"), "--name", "N", "--out", join(dir, "lf.html"));
    invoke("--bundle", join(dir, "crlf"), "--name", "N", "--out", join(dir, "crlf.html"));
    expect(readFileSync(join(dir, "crlf.html")).equals(readFileSync(join(dir, "lf.html")))).toBe(
      true,
    );
    invoke("--bundle", join(dir, "crlf"), "--name", "Minimal", "--out", join(dir, "golden.html"));
    expect(
      Buffer.from(unversioned(readFileSync(join(dir, "golden.html"), "utf8"))).equals(
        readFileSync(fixturePath("golden/minimal.html")),
      ),
    ).toBe(true);
  });

  test("--libraries inline writes a viewer that carries its libraries", () => {
    write("b/a.md", doc("x"));
    const out = join(dir, "inline.html");
    expect(invoke("--bundle", join(dir, "b"), "--out", out, "--libraries", "inline").code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(
      generateViewer({
        name: "b",
        files: { "a.md": doc("x") },
        options: { libraries: inlineLibraries },
      }).html,
    );
  });

  test("--libraries cdn is the default", () => {
    write("b/a.md", doc("x"));
    invoke("--bundle", join(dir, "b"), "--out", join(dir, "default.html"));
    invoke("--bundle", join(dir, "b"), "--out", join(dir, "cdn.html"), "--libraries", "cdn");
    expect(
      readFileSync(join(dir, "cdn.html")).equals(readFileSync(join(dir, "default.html"))),
    ).toBe(true);
  });

  test("a rerun over its own output changes nothing", () => {
    write("b/a.md", doc("x"));
    invoke("--bundle", join(dir, "b"));
    const first = readFileSync(join(dir, "b/viz.html"));
    invoke("--bundle", join(dir, "b"));
    expect(readFileSync(join(dir, "b/viz.html")).equals(first)).toBe(true);
  });

  test("an output path that can't be written is an error, not a stack trace", () => {
    write("b/a.md", doc("x"));
    mkdirSync(join(dir, "taken"));
    const { code, stderr } = invoke("--bundle", join(dir, "b"), "--out", join(dir, "taken"));
    expect(code).toBe(1);
    expect(stderr).toMatch(/^okf-viz: .*taken/);
    expect(stderr.trim().split(String.fromCharCode(10))).toHaveLength(1);
  });

  test("a directory that doesn't exist is an error, not a stack trace", () => {
    const { code, stderr } = invoke("--bundle", join(dir, "nowhere"));
    expect(code).toBe(1);
    expect(stderr).toMatch(/^okf-viz: .*nowhere.* isn't a directory\n$/);
  });
});

describe("okf-viz --repo", () => {
  beforeEach(() => {
    write("bundles/sales/a.md", doc("[l](../finance/ledger.md)"));
    write("bundles/finance/ledger.md", doc("x"));
    write("archive/sales/old.md", doc("x"));
  });

  test("writes one viewer over the bundles, at the repository's root", () => {
    const { code, stderr } = invoke(
      "--repo",
      dir,
      "--bundles",
      "bundles/sales,bundles/finance",
      "--name",
      "Repo",
    );
    expect(code).toBe(0);
    const expected = generateRepoViewer({
      name: "Repo",
      bundles: [
        {
          slug: "sales",
          title: "sales",
          root: "bundles/sales",
          files: walk(join(dir, "bundles/sales")),
        },
        {
          slug: "finance",
          title: "finance",
          root: "bundles/finance",
          files: walk(join(dir, "bundles/finance")),
        },
      ],
    });
    expect(readFileSync(join(dir, "viz.html"), "utf8")).toBe(expected.html);
    expect(stderr).toContain("Wrote 2 concept(s), 1 edge(s)");
  });

  test("two roots that end in the same segment take their whole root as slug", () => {
    invoke("--repo", dir, "--bundles", "bundles/sales, archive/sales/ ,./bundles/finance");
    const html = readFileSync(join(dir, "viz.html"), "utf8");
    const data = JSON.parse(
      /<script type="application\/json" id="okf-data">(.*?)<\/script>/s.exec(html)?.[1] as string,
    );
    expect(data.graph.bundles).toEqual([
      { slug: "archive-sales", title: "archive-sales", root: "archive/sales" },
      { slug: "bundles-sales", title: "bundles-sales", root: "bundles/sales" },
      { slug: "finance", title: "finance", root: "bundles/finance" },
    ]);
  });

  test("a root that isn't a directory is an error", () => {
    const { code, stderr } = invoke("--repo", dir, "--bundles", "bundles/sales,bundles/gone");
    expect(code).toBe(1);
    expect(stderr).toMatch(/gone.* isn't a directory/);
  });

  test("a root outside the repository is an error", () => {
    const { code, stderr } = invoke(
      "--repo",
      join(dir, "bundles"),
      "--bundles",
      "../archive/sales",
    );
    expect(code).toBe(1);
    expect(stderr).toContain("okf-viz: ");
  });
});

describe("okf-viz usage", () => {
  test.each([
    [[], "neither --bundle nor --repo"],
    [["--bundle", "a", "--repo", "b", "--bundles", "c"], "both"],
    [["--repo", "a"], "--repo without --bundles"],
    [["--bundle", "a", "--bundles", "c"], "--bundles without --repo"],
    [["--repo", "a", "--bundles", " , "], "no roots"],
    [["--bundle", "a", "--frobnicate"], "an unknown flag"],
    [["--bundle"], "a flag without its value"],
    [["--bundle", "a", "stray"], "a stray argument"],
    [["--bundle", "a", "--libraries", "bundled"], "libraries that are neither cdn nor inline"],
  ])("%j is a usage error (%s)", (argv) => {
    const { code, stdout, stderr } = invoke(...argv);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("okf-viz: ");
    expect(stderr).toContain("Usage:");
  });

  test("--help prints the usage and succeeds", () => {
    const { code, stdout, stderr } = invoke("--help");
    expect(code).toBe(0);
    expect(stdout).toContain(
      "okf-viz --bundle <dir> [--out <file>] [--name <text>] [--libraries cdn|inline]",
    );
    expect(stdout).toContain(
      "okf-viz --repo <dir> --bundles <root>[,<root>…] [--out <file>] [--name <text>] [--libraries cdn|inline]",
    );
    expect(stderr).toBe("");
  });

  test("--version prints the version", () => {
    expect(invoke("--version")).toEqual({ code: 0, stdout: `${VERSION}\n`, stderr: "" });
  });
});
