import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const generated = `${root}src/generated/assets.ts`;

const digest = (algorithm: string, data: string | Uint8Array) =>
  createHash(algorithm).update(data).digest("base64");

describe("build-assets", () => {
  test("building twice writes identical bytes", () => {
    execFileSync(process.execPath, ["scripts/build-assets.mjs"], { cwd: root });
    const first = readFileSync(generated);
    execFileSync(process.execPath, ["scripts/build-assets.mjs"], { cwd: root });
    expect(readFileSync(generated).equals(first)).toBe(true);
  });

  test("no asset contains a carriage return", async () => {
    const assets = await import("../../src/generated/assets.js");
    for (const text of [assets.TEMPLATE, assets.CSS, assets.JS]) {
      expect(text).not.toContain("\r");
    }
  });

  test("the inline hashes are those of the inlined text", async () => {
    const assets = await import("../../src/generated/assets.js");
    expect(assets.CSS_SHA256).toBe(digest("sha256", assets.CSS));
    expect(assets.JS_SHA256).toBe(digest("sha256", assets.JS));
  });

  test("each library is pinned by version and by the hash of its npm file", async () => {
    const { LIBS } = await import("../../src/generated/assets.js");
    expect(LIBS.cytoscape.url).toBe(
      "https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.min.js",
    );
    expect(LIBS.marked.url).toBe("https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js");
    expect(LIBS.cytoscape.sri).toBe(
      `sha384-${digest("sha384", readFileSync(`${root}node_modules/cytoscape/dist/cytoscape.min.js`))}`,
    );
    expect(LIBS.marked.sri).toBe(
      `sha384-${digest("sha384", readFileSync(`${root}node_modules/marked/marked.min.js`))}`,
    );
  });

  test("the build without sanitizing differs only in its script", async () => {
    const assets = await import("../../src/generated/assets.js");
    const { UNSAFE_ASSETS } = await import("../../src/generated/assets.unsafe.js");
    expect(UNSAFE_ASSETS.JS).not.toBe(assets.JS);
    expect(UNSAFE_ASSETS.JS_SHA256).toBe(digest("sha256", UNSAFE_ASSETS.JS));
    expect({ ...UNSAFE_ASSETS, JS: assets.JS, JS_SHA256: assets.JS_SHA256 }).toEqual({ ...assets });
  });

  test("the build without sanitizing is in no build of the package", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? sources(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
      );
    const files = sources(`${root}src`).filter((file) => !file.includes("/generated/"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toContain("assets.unsafe");
    }
  });

  test("the version is the package's", async () => {
    const { VERSION } = await import("../../src/generated/assets.js");
    expect(VERSION).toBe(JSON.parse(readFileSync(`${root}package.json`, "utf8")).version);
  });

  test("the template has each placeholder exactly once", async () => {
    const { TEMPLATE } = await import("../../src/generated/assets.js");
    for (const name of ["CSP", "CSS", "JS", "DATA", "LIBRARIES"]) {
      expect(TEMPLATE.split(`{{${name}}}`).length, name).toBe(2);
    }
  });
});
