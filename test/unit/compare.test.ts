import { describe, expect, test } from "vitest";
import { codePointLength, compareCodePoints } from "../../src/core/compare.js";

describe("compareCodePoints", () => {
  test("orders by code point where UTF-16 code units would not", () => {
    // U+1F600 is stored as D83D DE00, which sorts before U+FF5E by code unit.
    const astral = "\u{1F600}";
    const bmp = "\uFF5E";
    expect([astral, bmp].sort()).toEqual([astral, bmp]);
    expect([astral, bmp].sort(compareCodePoints)).toEqual([bmp, astral]);
  });

  test("a prefix sorts before the longer string", () => {
    expect(compareCodePoints("tables", "tables/orders")).toBeLessThan(0);
    expect(compareCodePoints("tables/orders", "tables")).toBeGreaterThan(0);
  });

  test("equal strings compare as zero", () => {
    expect(compareCodePoints("a/b", "a/b")).toBe(0);
  });

  test("does not depend on locale: uppercase sorts before lowercase", () => {
    expect(["b", "B", "a"].sort(compareCodePoints)).toEqual(["B", "a", "b"]);
  });
});

describe("codePointLength", () => {
  test("counts an astral character once, as Python's len does", () => {
    expect(codePointLength("a\u{1F600}b")).toBe(3);
    expect("a\u{1F600}b".length).toBe(4);
  });
});
