import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../../src/generated/assets.js";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** Every file under test/fixtures/<name>, by '/'-separated relative path. */
export function readBundle(name: string): Record<string, string> {
  const root = `${fixtures}${name}/`;
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    files[relative(root, file).replaceAll("\\", "/")] = readFileSync(file, "utf8");
  }
  return files;
}

/**
 * A viewer with the package's version written out of it. Golden files hold
 * this form, so that a release, which changes the version and nothing else,
 * leaves them as they are.
 */
export const unversioned = (html: string) => html.replaceAll(`okf-viz/${VERSION}`, "okf-viz/0.0.0");

export const fixturePath = (path: string) => fixtures + path;
