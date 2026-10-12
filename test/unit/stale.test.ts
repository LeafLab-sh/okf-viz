import { describe, expect, test } from "vitest";
import { isStale } from "../../src/viewer/stale.js";

const at = (iso: string) => Date.parse(iso);

describe("isStale", () => {
  test("a concept is stale at its stale_after instant and after it, not before", () => {
    const staleAfter = "2026-09-23T00:00:00Z";
    expect(isStale(staleAfter, at("2026-09-22T23:59:59Z"))).toBe(false);
    expect(isStale(staleAfter, at("2026-09-23T00:00:00Z"))).toBe(true);
    expect(isStale(staleAfter, at("2026-09-23T00:00:01Z"))).toBe(true);
  });

  test("an offset is honoured", () => {
    const staleAfter = "2026-09-23T00:00:00+02:00";
    expect(isStale(staleAfter, at("2026-09-22T21:59:59Z"))).toBe(false);
    expect(isStale(staleAfter, at("2026-09-22T22:00:00Z"))).toBe(true);
  });

  test("fractional seconds and a time without seconds are accepted", () => {
    expect(isStale("2026-09-23T00:00:00.500Z", at("2026-09-23T00:00:01Z"))).toBe(true);
    expect(isStale("2026-09-23T00:00Z", at("2026-09-23T00:00:01Z"))).toBe(true);
  });

  test.each([
    ["", "absent"],
    ["2020-01-01", "a date alone names a different instant in every timezone"],
    ["2020-01-01T00:00:00", "no offset"],
    ["2020-01-01 00:00:00Z", "no T"],
    ["2020-13-45T00:00:00Z", "not a date"],
    ["yesterday", "not a date"],
    ["2020-01-01T00:00:00Z trailing", "trailing text"],
  ])("%j is never stale (%s)", (staleAfter) => {
    expect(isStale(staleAfter, at("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
