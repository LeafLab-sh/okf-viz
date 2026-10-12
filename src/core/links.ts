// Link recognition and path resolution, shared by the generator and the
// viewer's browser script so that an edge and a click agree on where a link
// goes (SPEC §4.1).

// The characters Python's `\s` matches in a str pattern.
function isSpace(code: number): boolean {
  return (
    (code >= 9 && code <= 13) ||
    (code >= 28 && code <= 32) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function isFragmentChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 45
  );
}

const CLOSE_PAREN = 41;
const HASH = 35;

/**
 * The targets of a body's links to `.md` files, in document order, without
 * their fragments. It finds what the reference generator's pattern finds,
 *
 *     \]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)
 *
 * but in one pass: that pattern backtracks, and takes time quadratic in the
 * length of a body made of unterminated links.
 */
export function extractLinkTargets(body: string): string[] {
  const targets: string[] = [];
  // The run of characters that are neither ')' nor whitespace which holds the
  // current position. Every "](" inside one run shares its end, its last '#'
  // and whether the text after that '#' is a fragment.
  let runEnd = -1;
  let lastHash = -1;
  let fragmentOk: boolean | undefined;

  let from = 0;
  for (;;) {
    const open = body.indexOf("](", from);
    if (open < 0) break;
    const start = open + 2;

    if (start > runEnd) {
      lastHash = -1;
      fragmentOk = undefined;
      let i = start;
      for (; i < body.length; i++) {
        const code = body.charCodeAt(i);
        if (code === CLOSE_PAREN || isSpace(code)) break;
        if (code === HASH) lastHash = i;
      }
      runEnd = i;
    }

    let targetEnd = -1;
    if (body.charCodeAt(runEnd) === CLOSE_PAREN) {
      if (runEnd - start >= 4 && body.startsWith(".md", runEnd - 3)) {
        targetEnd = runEnd;
      } else if (lastHash - start >= 4 && body.startsWith(".md", lastHash - 3)) {
        if (fragmentOk === undefined) {
          fragmentOk = true;
          for (let i = lastHash + 1; i < runEnd; i++) {
            if (!isFragmentChar(body.charCodeAt(i))) {
              fragmentOk = false;
              break;
            }
          }
        }
        if (fragmentOk) targetEnd = lastHash;
      }
    }

    if (targetEnd < 0) {
      from = open + 1;
    } else {
      targets.push(body.slice(start, targetEnd));
      from = runEnd + 1;
    }
  }
  return targets;
}

/**
 * Resolves a link target to a path inside the bundle. A target that begins
 * with '/' is taken from the bundle root, any other from `fromDir`, the
 * directory of the linking concept ('' for the root). Gives null for a URL
 * and for a path that leaves the bundle.
 */
export function resolvePath(target: string, fromDir: string): string | null {
  if (target === "" || target.includes("://")) return null;
  const segments = target.startsWith("/") || fromDir === "" ? [] : fromDir.split("/");
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? null : segments.join("/");
}

/**
 * The ID of the concept a link target names, or null. The target is tried as
 * written, then percent-decoded, since a markdown renderer follows
 * `my%20file.md` to the file `my file.md`.
 */
export function resolveConceptId(
  target: string,
  fromDir: string,
  has: (id: string) => boolean,
): string | null {
  const candidates = [target];
  try {
    const decoded = decodeURIComponent(target);
    if (decoded !== target) candidates.push(decoded);
  } catch {
    // Not valid percent-encoding: only the literal target is tried.
  }
  for (const candidate of candidates) {
    const path = resolvePath(candidate, fromDir);
    if (path === null || !path.endsWith(".md")) continue;
    const id = path.slice(0, -3);
    if (id !== "" && has(id)) return id;
  }
  return null;
}

/** The directory of a concept ID or file path: '' for the bundle root. */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** What link resolution needs to know of one bundle in a repo viewer. */
export type BundleIndex = {
  slug: string;
  /** The bundle's directory in the repository: '' for the repository root. */
  root: string;
  /** Whether the bundle has a concept with this ID, without the slug. */
  has(id: string): boolean;
};

/**
 * The ID, with its slug, of the concept a link names in a repo viewer
 * (SPEC §4.1). The link is resolved inside its own bundle first. A relative
 * link that leaves the bundle is then resolved in the repository, and lands
 * in the innermost bundle that has a concept there.
 *
 * `bundles` is every bundle, the one with the longest root first.
 */
export function resolveRepoConceptId(
  target: string,
  fromDir: string,
  own: BundleIndex,
  bundles: readonly BundleIndex[],
): string | null {
  const local = resolveConceptId(target, fromDir, own.has);
  if (local !== null) return `${own.slug}/${local}`;
  // A '/'-absolute link is anchored at its bundle's root and can't leave it.
  if (target.startsWith("/")) return null;

  const repoDir = [own.root, fromDir].filter((part) => part !== "").join("/");
  for (const bundle of bundles) {
    const prefix = bundle.root === "" ? "" : `${bundle.root}/`;
    const found = resolveConceptId(
      target,
      repoDir,
      (repoId) => repoId.startsWith(prefix) && bundle.has(repoId.slice(prefix.length)),
    );
    if (found !== null) return `${bundle.slug}/${found.slice(prefix.length)}`;
  }
  return null;
}

/** Bundles ordered for resolveRepoConceptId: longest root first, then by slug. */
export function byInnermost<T extends { slug: string; root: string }>(bundles: readonly T[]): T[] {
  return [...bundles].sort(
    (a, b) => b.root.length - a.root.length || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}
