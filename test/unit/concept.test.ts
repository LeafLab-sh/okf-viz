import { describe, expect, test } from "vitest";
import { toConcept } from "../../src/core/concept.js";

const concept = (frontmatter: Record<string, unknown>, body = "") =>
  toConcept("dir/thing", { frontmatter, body });

describe("toConcept", () => {
  test("fills what an empty frontmatter leaves out", () => {
    expect(concept({})).toEqual({
      id: "dir/thing",
      type: "Unknown",
      title: "dir/thing",
      description: "",
      resource: "",
      tags: [],
      body: "",
      status: "stable",
      generated: {},
      verified: [],
      stale_after: "",
      sources: [],
      trust_tier: "unverified",
    });
  });

  test("an empty value counts as absent, as Python's `or` treats it", () => {
    const c = concept({ type: "", title: 0, status: false, description: null, tags: {} });
    expect(c).toMatchObject({
      type: "Unknown",
      title: "dir/thing",
      status: "stable",
      description: "",
      tags: [],
    });
  });

  test("scalars are shown as text", () => {
    expect(concept({ type: 42, title: true, description: 1.5 })).toMatchObject({
      type: "42",
      title: "True",
      description: "1.5",
    });
  });

  test("a tag that isn't in a list becomes a one-element list", () => {
    expect(concept({ tags: "solo" }).tags).toEqual(["solo"]);
    expect(concept({ tags: ["a", 2] }).tags).toEqual(["a", "2"]);
  });

  test("a bare verified mapping becomes a one-element list", () => {
    expect(concept({ verified: { by: "agent:x", at: "t" } }).verified).toEqual([
      { by: "agent:x", at: "t" },
    ]);
  });

  test("verified entries that aren't mappings are dropped", () => {
    expect(concept({ verified: [{ by: "agent:x" }, "nope", 3] }).verified).toEqual([
      { by: "agent:x" },
    ]);
    expect(concept({ verified: "yes" }).verified).toEqual([]);
  });

  test.each([
    [undefined, "unverified"],
    [[], "unverified"],
    [{ by: "agent:checker" }, "machine-confirmed"],
    [[{ by: "agent:checker" }, { by: "human:lea" }], "human-reviewed"],
    [[{ at: "2026-01-01T00:00:00Z" }], "machine-confirmed"],
  ])("verified %j gives the tier %s", (verified, tier) => {
    expect(concept({ verified }).trust_tier).toBe(tier);
  });

  test("a bare sources mapping becomes a one-element list", () => {
    expect(concept({ sources: { title: "One" } }).sources).toEqual([{ title: "One" }]);
    expect(concept({ sources: [{ title: "A" }, "text"] }).sources).toEqual([{ title: "A" }]);
    expect(concept({ sources: "text" }).sources).toEqual([]);
  });

  test("generated that isn't a mapping is empty", () => {
    expect(concept({ generated: "agent:x" }).generated).toEqual({});
    expect(concept({ generated: { by: "agent:x", at: "t" } }).generated).toEqual({
      by: "agent:x",
      at: "t",
    });
  });

  test("values JSON can't hold become null", () => {
    const c = concept({ sources: [{ score: Number.NaN, limit: Number.POSITIVE_INFINITY }] });
    expect(c.sources).toEqual([{ score: null, limit: null }]);
  });

  test("a source key named __proto__ stays an ordinary key", () => {
    const source = JSON.parse('{"__proto__": {"polluted": true}, "title": "T"}');
    const c = concept({ sources: [source] });
    expect(Object.keys(c.sources[0] as object)).toEqual(["__proto__", "title"]);
    expect((c.sources[0] as Record<string, unknown>).polluted).toBeUndefined();
  });
});
