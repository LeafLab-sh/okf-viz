// T1 and T2: fixture bundles produce byte-identical viewers, whatever order
// their files are passed in. The golden files change whenever the viewer's
// template, stylesheet or script do; `just update-golden` rewrites them, and
// their diff is reviewed like code. They hold a fixed version in place of the
// package's, so a release doesn't change them.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { generateViewer } from "../../src/index.js";
import { fixturePath, readBundle, unversioned } from "../helpers/fixtures.js";

const CASES = [
  { name: "minimal", bundle: "minimal", title: "Minimal" },
  { name: "edge", bundle: "edge", title: "Edge cases" },
  { name: "acme_retail", bundle: "okf/acme_retail", title: "acme_retail" },
];

const update = process.env.UPDATE_GOLDEN === "1";

describe.each(CASES)("the $name bundle", ({ name, bundle, title }) => {
  const files = readBundle(bundle);
  const golden = fixturePath(`golden/${name}.html`);
  const { html } = generateViewer({ name: title, files });

  test("produces the golden file, byte for byte", () => {
    if (update) writeFileSync(golden, unversioned(html));
    expect(existsSync(golden), "no golden file: run `just update-golden`").toBe(true);
    expect(Buffer.from(unversioned(html)).equals(readFileSync(golden))).toBe(true);
  });

  test("produces the same bytes from the files in another order", () => {
    const entries = Object.entries(files);
    const rotated = [...entries.slice(3), ...entries.slice(0, 3)];
    expect(generateViewer({ name: title, files: entries.reverse() }).html).toBe(html);
    expect(generateViewer({ name: title, files: new Map(rotated) }).html).toBe(html);
  });

  test("produces the same bytes from files with CRLF line endings", () => {
    const crlf = Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, content.replaceAll("\n", "\r\n")]),
    );
    expect(generateViewer({ name: title, files: crlf }).html).toBe(html);
  });
});
