// Removes the build output named on the command line, or all of it.

import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const known = ["dist", "src/generated", "coverage", "test-results", "playwright-report"];
const targets = process.argv.length > 2 ? process.argv.slice(2) : known;

for (const target of targets) {
  if (!known.includes(target)) throw new Error(`Not build output: ${target}`);
  rmSync(root + target, { recursive: true, force: true });
}
