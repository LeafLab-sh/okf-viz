// SPEC §5.3: a viewer loads its two libraries from the CDN, or carries them.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LIBS } from "../../src/generated/assets.js";
import { generateRepoViewer, generateViewer } from "../../src/index.js";
import { inlineLibraries } from "../../src/inline.js";
import { readBundle } from "../helpers/fixtures.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = (text: string) => createHash("sha256").update(text).digest("base64");
const files = readBundle("minimal");

const cspOf = (html: string) =>
  /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1] as string;
const scriptSources = (html: string) =>
  (
    cspOf(html)
      .split("; ")
      .find((d) => d.startsWith("script-src ")) as string
  )
    .split(" ")
    .slice(1);
// The executable inline scripts: those with no attributes.
const inlineScripts = (html: string) =>
  Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1] as string);

describe("inlineLibraries", () => {
  test("holds each library as npm published it, with the hash of that text", () => {
    for (const [library, file] of [
      [inlineLibraries.cytoscape, "node_modules/cytoscape/dist/cytoscape.min.js"],
      [inlineLibraries.marked, "node_modules/marked/marked.min.js"],
    ] as const) {
      expect(library.code).toBe(readFileSync(root + file, "utf8"));
      expect(library.sha256).toBe(sha256(library.code));
    }
  });

  test("keeps each library's own licence notice", () => {
    expect(inlineLibraries.cytoscape.code).toContain("The Cytoscape Consortium");
    expect(inlineLibraries.marked.code).toContain("Christopher Jeffrey");
  });
});

describe("a viewer that loads its libraries from the CDN", () => {
  const byDefault = generateViewer({ name: "N", files }).html;

  test("is what is written when nothing is asked", () => {
    expect(generateViewer({ name: "N", files, options: { libraries: "cdn" } }).html).toBe(
      byDefault,
    );
  });

  test("names the two pinned URLs, and carries neither library", () => {
    expect(scriptSources(byDefault).slice(0, 2)).toEqual([LIBS.cytoscape.url, LIBS.marked.url]);
    expect(inlineScripts(byDefault)).toHaveLength(1);
    expect(byDefault.length).toBeLessThan(100_000);
  });
});

describe("a viewer that carries its libraries", () => {
  const { html, stats } = generateViewer({
    name: "N",
    files,
    options: { libraries: inlineLibraries },
  });

  test("names no other origin anywhere", () => {
    expect(html).not.toContain("https://cdn.jsdelivr.net");
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toContain("integrity=");
  });

  test("holds both libraries before its own script, each exactly as published", () => {
    const [cytoscape, marked, viewer, ...rest] = inlineScripts(html);
    expect(rest).toEqual([]);
    expect(cytoscape).toBe(inlineLibraries.cytoscape.code);
    expect(marked).toBe(inlineLibraries.marked.code);
    expect(viewer).not.toBe("");
  });

  test("allows script by three hashes and nothing else", () => {
    const sources = scriptSources(html);
    expect(sources).toEqual(inlineScripts(html).map((script) => `'sha256-${sha256(script)}'`));
    expect(sources).toHaveLength(3);
    expect(sources).toContain(`'sha256-${inlineLibraries.cytoscape.sha256}'`);
    expect(sources).toContain(`'sha256-${inlineLibraries.marked.sha256}'`);
  });

  test("reports its larger size", () => {
    expect(stats.bytes).toBe(new TextEncoder().encode(html).length);
    expect(stats.bytes).toBeGreaterThan(
      inlineLibraries.cytoscape.code.length + inlineLibraries.marked.code.length,
    );
  });

  test("is the same bytes every time", () => {
    const again = generateViewer({ name: "N", files, options: { libraries: inlineLibraries } });
    expect(again.html).toBe(html);
  });

  test("embeds the same graph as the CDN form", () => {
    const data = (text: string) =>
      /<script type="application\/json" id="okf-data">(.*?)<\/script>/s.exec(text)?.[1];
    expect(data(html)).toBe(data(generateViewer({ name: "N", files }).html));
  });

  test("can be a repo viewer too", () => {
    const repo = generateRepoViewer({
      name: "R",
      bundles: [{ slug: "a", title: "A", root: "a", files }],
      options: { libraries: inlineLibraries },
    });
    expect(repo.html).not.toContain("https://cdn.jsdelivr.net");
    expect(inlineScripts(repo.html)).toHaveLength(3);
  });
});

describe("a malformed libraries option", () => {
  const library = inlineLibraries.marked;
  test.each([
    ["a word that isn't cdn", "inline"],
    ["an object missing a library", { cytoscape: library }],
    ["code that isn't text", { cytoscape: library, marked: { ...library, code: 1 } }],
    [
      "a hash that isn't a SHA-256 in base64",
      { cytoscape: library, marked: { ...library, sha256: "abc" } },
    ],
    [
      "code that would end its script element",
      { cytoscape: library, marked: { code: "x</ScRiPt>y", sha256: sha256("x</ScRiPt>y") } },
    ],
    [
      "code that could swallow the tag that ends its element",
      {
        cytoscape: library,
        marked: { code: "a<!--b<script c", sha256: sha256("a<!--b<script c") },
      },
    ],
    [
      "code with a carriage return",
      { cytoscape: library, marked: { code: "a\rb", sha256: sha256("a\rb") } },
    ],
  ])("%s throws", (_, libraries) => {
    expect(() =>
      generateViewer({ name: "N", files, options: { libraries: libraries as never } }),
    ).toThrow(TypeError);
  });
});
