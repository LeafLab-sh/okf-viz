import { describe, expect, test } from "vitest";
import { extractLinkTargets, resolveConceptId, resolvePath } from "../../src/core/links.js";

// The reference generator's pattern (generator.py, _LINK_RE), character for
// character, so that the comparison is with what the reference runs.
// biome-ignore lint/complexity/noUselessEscapeInRegex: copied verbatim from the reference
const REFERENCE = /\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)/g;
const byReference = (body: string) => Array.from(body.matchAll(REFERENCE), (m) => m[1]);

describe("extractLinkTargets", () => {
  test.each([
    ["See [orders](tables/orders.md).", ["tables/orders.md"]],
    ["[a](/tables/a.md) and [b](../b.md)", ["/tables/a.md", "../b.md"]],
    ["[a](a.md#schema)", ["a.md"]],
    ["[a](a.md#)", ["a.md"]],
    ["[a](a.md#bad.frag)", []],
    ["[a](a.md 'title')", []],
    ["[a](a.txt)", []],
    ["[a](.md)", []],
    ["[site](https://example.com/page.md)", ["https://example.com/page.md"]],
    ["`[code](in/code.md)`", ["in/code.md"]],
    ["[a](a.md)[b](b.md)", ["a.md", "b.md"]],
    ["[a](a#b.md)", ["a#b.md"]],
    ["[a](x](y.md)", ["x](y.md"]],
    ["no links here", []],
  ])("%j", (body, expected) => {
    expect(extractLinkTargets(body)).toEqual(expected);
    expect(byReference(body)).toEqual(expected);
  });

  test("agrees with the reference pattern on generated bodies", () => {
    const pieces = ["](", ")", " ", "#", ".md", "a", "b/", "\n", "[", "..", "_"];
    let seed = 0x2f6e2b1;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 3000; i++) {
      let body = "";
      const length = 1 + (next() % 14);
      for (let j = 0; j < length; j++) body += pieces[next() % pieces.length];
      expect(extractLinkTargets(body), JSON.stringify(body)).toEqual(byReference(body));
    }
  });

  test("a megabyte of unterminated link openings is scanned in linear time", () => {
    const body = "](a".repeat(350_000);
    const started = performance.now();
    expect(extractLinkTargets(body)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("resolvePath", () => {
  test.each([
    ["orders.md", "tables", "tables/orders.md"],
    ["./orders.md", "tables", "tables/orders.md"],
    ["../metrics/revenue.md", "tables", "metrics/revenue.md"],
    ["a.md", "", "a.md"],
    ["/tables/orders.md", "metrics/deep", "tables/orders.md"],
    ["sub//x.md", "", "sub/x.md"],
    ["a/./b/../c.md", "", "a/c.md"],
  ])("%j from %j is %j", (target, fromDir, expected) => {
    expect(resolvePath(target, fromDir)).toBe(expected);
  });

  test.each([
    ["../outside.md", ""],
    ["../../outside.md", "tables"],
    ["/../outside.md", "tables"],
    ["https://example.com/a.md", ""],
    ["", "tables"],
    ["..", "tables"],
  ])("%j from %j leaves the bundle or isn't a path", (target, fromDir) => {
    expect(resolvePath(target, fromDir)).toBeNull();
  });
});

describe("resolveConceptId", () => {
  const ids = new Set(["tables/orders", "my file", "a%20b"]);
  const has = (id: string) => ids.has(id);

  test("resolves a link to the ID of the concept it names", () => {
    expect(resolveConceptId("../tables/orders.md", "metrics", has)).toBe("tables/orders");
  });

  test("a link to a missing concept resolves to nothing", () => {
    expect(resolveConceptId("missing.md", "", has)).toBeNull();
  });

  test("a link to a file that isn't .md resolves to nothing", () => {
    expect(resolveConceptId("tables/orders", "", has)).toBeNull();
  });

  test("a percent-encoded link finds the file it encodes", () => {
    expect(resolveConceptId("my%20file.md", "", has)).toBe("my file");
  });

  test("the literal path is preferred to its decoding", () => {
    expect(resolveConceptId("a%20b.md", "", has)).toBe("a%20b");
  });

  test("a malformed percent-encoding resolves to nothing", () => {
    expect(resolveConceptId("bad%zz.md", "", has)).toBeNull();
  });
});
