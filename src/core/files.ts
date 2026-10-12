import type { Files } from "../types.js";
import { compareCodePoints } from "./compare.js";

function isIterable(files: Files): files is Iterable<readonly [string, string]> {
  return typeof (files as Iterable<unknown>)[Symbol.iterator] === "function";
}

/** Throws unless the path is relative, '/'-separated and has no '.' or '..'. */
export function checkPath(path: string): void {
  const problem = path.startsWith("/")
    ? "begins with '/'"
    : path.includes("\\")
      ? "contains a backslash"
      : path.includes("\u0000")
        ? "contains U+0000"
        : path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
          ? "has an empty, '.' or '..' segment"
          : undefined;
  if (problem !== undefined) {
    throw new TypeError(`File path ${JSON.stringify(path)} ${problem}`);
  }
}

/**
 * The bundle's `.md` files as [path, content] pairs: validated, with line
 * endings normalized to LF, sorted by path. Other files are ignored, so a
 * caller can pass a whole directory listing (SPEC §3.1).
 */
export function normalizeFiles(files: Files): Array<[path: string, content: string]> {
  const entries = isIterable(files) ? files : Object.entries(files);
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [path, content] of entries) {
    if (typeof path !== "string") throw new TypeError("A file path isn't a string");
    if (!path.endsWith(".md")) continue;
    checkPath(path);
    if (typeof content !== "string") {
      throw new TypeError(`The content of ${JSON.stringify(path)} isn't a string`);
    }
    if (seen.has(path)) throw new TypeError(`Two files have the path ${JSON.stringify(path)}`);
    seen.add(path);
    out.push([path, content.replace(/\r\n?/g, "\n")]);
  }
  return out.sort((a, b) => compareCodePoints(a[0], b[0]));
}
