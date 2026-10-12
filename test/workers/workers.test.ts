// T6: the package imports and generates a viewer in a Workers runtime, with
// no Node compatibility flag. This tests the built package in dist/, so it
// runs after a build: `just test-workers`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fixturePath, readBundle, unversioned } from "../helpers/fixtures.js";

const root = fileURLToPath(new URL("../../", import.meta.url));

let worker: Miniflare;

beforeAll(async () => {
  // Bundled as Wrangler bundles a Worker: no Node platform, and the package
  // conditions a Worker resolves. An import of a Node built-in can't be
  // resolved here, and fails the test.
  const bundled = await build({
    absWorkingDir: root,
    entryPoints: ["test/workers/worker.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    mainFields: ["browser", "module", "main"],
    conditions: ["workerd", "worker", "browser"],
    write: false,
    logLevel: "silent",
  });
  worker = new Miniflare({
    modules: true,
    script: bundled.outputFiles[0]?.text ?? "",
    compatibilityDate: "2026-01-01",
    compatibilityFlags: [],
  });
});

afterAll(async () => {
  await worker?.dispose();
});

const post = (body: unknown) =>
  worker.dispatchFetch("http://worker/", { method: "POST", body: JSON.stringify(body) });

describe("in a Workers runtime without Node compatibility", () => {
  test("generates a bundle's viewer, byte for byte the golden file", async () => {
    const response = await post({ name: "Minimal", files: readBundle("minimal") });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-has-process-versions-node")).toBe("false");
    const html = Buffer.from(await response.arrayBuffer());
    expect(
      Buffer.from(unversioned(html.toString("utf8"))).equals(
        readFileSync(fixturePath("golden/minimal.html")),
      ),
    ).toBe(true);
  });

  test("generates a larger bundle's viewer, the same as Node does", async () => {
    const response = await post({ name: "acme_retail", files: readBundle("okf/acme_retail") });
    const html = Buffer.from(await response.arrayBuffer());
    expect(
      Buffer.from(unversioned(html.toString("utf8"))).equals(
        readFileSync(fixturePath("golden/acme_retail.html")),
      ),
    ).toBe(true);
    expect(JSON.parse(response.headers.get("x-okf-stats") as string)).toMatchObject({
      concepts: 9,
      skipped: 0,
    });
  });

  test("generates a repo viewer", async () => {
    const response = await post({
      name: "Repo",
      bundles: [
        { slug: "a", title: "A", root: "a", files: { "x.md": "[y](../b/y.md)\n" } },
        { slug: "b", title: "B", root: "b", files: { "y.md": "Y\n" } },
      ],
    });
    expect(JSON.parse(response.headers.get("x-okf-stats") as string)).toMatchObject({
      concepts: 2,
      edges: 1,
    });
  });
});

describe("the package's inline entry, in a Workers runtime", () => {
  test("gives a viewer that carries its libraries", async () => {
    const response = await post({ name: "Minimal", files: readBundle("minimal"), inline: true });
    const html = await response.text();
    expect(html).not.toContain("https://cdn.jsdelivr.net");
    expect(html).toContain("The Cytoscape Consortium");
    expect(html.length).toBeGreaterThan(390_000);
  });
});

describe("the built library", () => {
  test("imports nothing but its one dependency", () => {
    const source = readFileSync(`${root}dist/index.js`, "utf8");
    const specifiers = Array.from(
      source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g),
      (match) => match[1],
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(new Set(specifiers)).toEqual(new Set(["yaml"]));
  });

  test("doesn't carry the libraries: those are the inline entry's", () => {
    const main = readFileSync(`${root}dist/index.js`, "utf8");
    const inline = readFileSync(`${root}dist/inline.js`, "utf8");
    expect(main.length).toBeLessThan(120_000);
    expect(main).not.toContain("The Cytoscape Consortium");
    expect(inline).toContain("The Cytoscape Consortium");
    expect(inline.length).toBeGreaterThan(390_000);
  });
});
