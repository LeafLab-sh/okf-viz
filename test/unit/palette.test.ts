import { describe, expect, test } from "vitest";
import { colorForType, FALLBACK_COLORS } from "../../src/core/palette.js";

describe("colorForType", () => {
  test("keeps the reference viewer's three colours", () => {
    expect(colorForType("BigQuery Dataset")).toBe("#8b5cf6");
    expect(colorForType("BigQuery Table")).toBe("#3b82f6");
    expect(colorForType("Reference")).toBe("#10b981");
  });

  test("a concept without a type keeps the reference's grey", () => {
    expect(colorForType("Unknown")).toBe("#94a3b8");
  });

  test("any other type gets a colour from the fixed list", () => {
    for (const type of ["Metric", "Policy", "Skill", "表", "__proto__", "constructor", ""]) {
      expect(FALLBACK_COLORS).toContain(colorForType(type));
    }
  });

  test("the colour of a type is pinned, so it can't drift between versions unnoticed", () => {
    expect(colorForType("Metric")).toMatchInlineSnapshot(`"#ea580c"`);
    expect(colorForType("Policy")).toMatchInlineSnapshot(`"#9333ea"`);
  });

  test("types spread over the list instead of sharing one colour", () => {
    const types = Array.from({ length: 200 }, (_, i) => `Type ${i}`);
    expect(new Set(types.map((type) => colorForType(type))).size).toBe(FALLBACK_COLORS.length);
  });

  test("a caller's palette overrides both lists", () => {
    const palette = { Metric: "#000000", "BigQuery Table": "#ffffff" };
    expect(colorForType("Metric", palette)).toBe("#000000");
    expect(colorForType("BigQuery Table", palette)).toBe("#ffffff");
    expect(colorForType("Reference", palette)).toBe("#10b981");
  });

  test("an inherited property of the caller's palette isn't an override", () => {
    expect(FALLBACK_COLORS).toContain(colorForType("toString", {}));
  });
});
