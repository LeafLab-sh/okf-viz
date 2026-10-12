import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The `.md` files under a directory, by '/'-separated path relative to it
 * (SPEC §3.2). Symbolic links aren't followed, and `node_modules` and
 * directories whose name begins with a dot aren't entered.
 */
export function walk(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        visit(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files[prefix + entry.name] = readFileSync(join(dir, entry.name), "utf8");
      }
    }
  };
  visit(root, "");
  return files;
}
