import { parse } from "yaml";

export type Document = { frontmatter: Record<string, unknown>; body: string };

const DELIMITER = "---";

// Python's str.splitlines, for text whose line endings are already LF: a
// final newline doesn't begin another line.
function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Splits a concept file into frontmatter and body, as the reference viewer's
 * OKFDocument.parse does. A file with no frontmatter block is all body. A
 * block that is unterminated, isn't valid YAML or isn't a mapping gives null,
 * and the file is skipped (SPEC §3.1).
 *
 * `text` has LF line endings.
 */
export function parseDocument(text: string): Document | null {
  const lines = splitLines(text.startsWith("\uFEFF") ? text.slice(1) : text);
  if (lines.length === 0 || (lines[0] as string).trim() !== DELIMITER) {
    return { frontmatter: {}, body: text };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] as string).trim() === DELIMITER) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;

  let parsed: unknown;
  try {
    // The YAML 1.2 core schema leaves a timestamp as the author's text, as the
    // reference's loader does. PyYAML accepts a repeated key and merge keys,
    // so these do too. `logLevel` keeps warnings off the console; errors
    // still throw.
    parsed = parse(lines.slice(1, end).join("\n"), {
      schema: "core",
      uniqueKeys: false,
      merge: true,
      maxAliasCount: 100,
      logLevel: "error",
    });
  } catch {
    return null;
  }
  // Python's `yaml.load(...) or {}`: nothing, or any falsy value, is no keys.
  if (
    parsed === null ||
    parsed === undefined ||
    parsed === false ||
    parsed === 0 ||
    parsed === ""
  ) {
    parsed = {};
  }
  if (Array.isArray(parsed) && parsed.length === 0) parsed = {};
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  let body = lines.slice(end + 1).join("\n");
  if (body.startsWith("\n")) body = body.slice(1);
  return { frontmatter: parsed as Record<string, unknown>, body };
}
