// Strips trailing spaces and tabs from each line, and blank lines from the
// end of the file, leaving one final newline, as .editorconfig asks.
//
//   node scripts/fix-whitespace.mjs <file>...        fix the files named
//   node scripts/fix-whitespace.mjs --all            fix every file Git tracks
//   node scripts/fix-whitespace.mjs --check [<file>...]
//                                                    report, change nothing;
//                                                    with no files, every
//                                                    file Git tracks
//
// Files it leaves alone:
//   - test/fixtures/: compared byte for byte, and vendored from elsewhere.
//   - Anything that isn't text it knows, such as an image or the lockfile,
//     and LICENSE, which is kept as its authors published it.
// In Markdown, two spaces at the end of a line are a line break, so there
// only blank lines at the end of the file are stripped.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const TEXT = new Set([
  "ts",
  "mts",
  "cts",
  "js",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "md",
  "yml",
  "yaml",
  "html",
  "css",
  "py",
  "txt",
  "toml",
  "sh",
]);
const TEXT_NAMES = new Set([
  "justfile",
  "NOTICE",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  "pre-commit",
  "commit-msg",
]);
// The last two are written by release-please, as it likes.
const SKIPPED = [
  "test/fixtures/",
  "src/generated/",
  "dist/",
  "node_modules/",
  "CHANGELOG.md",
  ".release-please-manifest.json",
];

function wanted(path) {
  if (SKIPPED.some((prefix) => path.startsWith(prefix))) return false;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (TEXT_NAMES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  return dot > 0 && TEXT.has(name.slice(dot + 1));
}

function fixed(text, path) {
  const lines = path.endsWith(".md") ? text : text.replace(/[ \t]+$/gm, "");
  const trimmed = lines.replace(/\s+$/, "");
  return trimmed === "" ? "" : `${trimmed}\n`;
}

const args = process.argv.slice(2);
const check = args[0] === "--check";
const all = args[0] === "--all";
const named = check || all ? args.slice(1) : args;
if (!check && !all && named.length === 0) process.exit(0);
const files =
  named.length > 0
    ? named.map((file) => relative(root, resolve(file)).replaceAll("\\", "/"))
    : execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");

const wrong = [];
for (const path of files) {
  if (path === "" || !wanted(path) || !existsSync(root + path)) continue;
  const text = readFileSync(root + path, "utf8");
  const result = fixed(text, path);
  if (result === text) continue;
  wrong.push(path);
  if (!check) writeFileSync(root + path, result);
}

if (check && wrong.length > 0) {
  console.error(`Trailing whitespace or blank lines at the end of:\n  ${wrong.join("\n  ")}`);
  console.error("Fix with: node scripts/fix-whitespace.mjs <file>...");
  process.exit(1);
}
