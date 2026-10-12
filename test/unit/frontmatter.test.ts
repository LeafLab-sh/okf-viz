import { describe, expect, test } from "vitest";
import { parseDocument } from "../../src/core/frontmatter.js";

describe("parseDocument", () => {
  test("splits frontmatter from body", () => {
    expect(parseDocument("---\ntype: Table\ntitle: Orders\n---\n\n# Schema\n\nText.\n")).toEqual({
      frontmatter: { type: "Table", title: "Orders" },
      body: "# Schema\n\nText.",
    });
  });

  test("a file with no frontmatter block is all body", () => {
    expect(parseDocument("# Just a heading\n\nText.\n")).toEqual({
      frontmatter: {},
      body: "# Just a heading\n\nText.\n",
    });
  });

  test("an empty frontmatter block is an empty mapping", () => {
    expect(parseDocument("---\n---\nBody")).toEqual({ frontmatter: {}, body: "Body" });
  });

  test("an unterminated block is skipped", () => {
    expect(parseDocument("---\ntype: Table\n\n# Body\n")).toBeNull();
  });

  test("invalid YAML is skipped", () => {
    expect(parseDocument("---\ntype: [unclosed\n---\nBody")).toBeNull();
  });

  test("frontmatter that isn't a mapping is skipped", () => {
    expect(parseDocument("---\n- a\n- b\n---\nBody")).toBeNull();
    expect(parseDocument("---\njust text\n---\nBody")).toBeNull();
  });

  test("delimiters may carry surrounding whitespace", () => {
    expect(parseDocument("---  \ntype: T\n  ---\nBody")).toEqual({
      frontmatter: { type: "T" },
      body: "Body",
    });
  });

  test("a leading byte-order mark doesn't hide the block", () => {
    expect(parseDocument("\uFEFF---\ntype: T\n---\nBody")?.frontmatter).toEqual({ type: "T" });
  });

  test("a timestamp stays the text the author wrote", () => {
    expect(parseDocument("---\nstale_after: 2026-06-30T14:00:00Z\n---\n")?.frontmatter).toEqual({
      stale_after: "2026-06-30T14:00:00Z",
    });
  });

  test("YAML 1.1 booleans stay text", () => {
    expect(parseDocument("---\ntitle: yes\nstatus: off\n---\n")?.frontmatter).toEqual({
      title: "yes",
      status: "off",
    });
  });

  test("the last of two duplicate keys wins", () => {
    expect(parseDocument("---\ntype: A\ntype: B\n---\n")?.frontmatter).toEqual({ type: "B" });
  });

  test("an alias bomb is skipped, not expanded", () => {
    const levels = ["a: &a [x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 12; i++) {
      const previous = String.fromCharCode(96 + i);
      const name = String.fromCharCode(97 + i);
      levels.push(`${name}: &${name} [${Array(9).fill(`*${previous}`).join(", ")}]`);
    }
    const started = performance.now();
    expect(parseDocument(`---\n${levels.join("\n")}\n---\nBody`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a key named __proto__ is an ordinary key", () => {
    const parsed = parseDocument("---\n__proto__: x\ntype: T\n---\n");
    expect(parsed?.frontmatter.type).toBe("T");
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
