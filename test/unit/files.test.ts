import { describe, expect, test } from "vitest";
import { normalizeFiles } from "../../src/core/files.js";

describe("normalizeFiles", () => {
  test("keeps only .md files", () => {
    expect(normalizeFiles({ "a.md": "A", "pic.png": "x", "notes.txt": "y", "b.MD": "z" })).toEqual([
      ["a.md", "A"],
    ]);
  });

  test("sorts by path, whatever order the files arrive in", () => {
    // "." is U+002E and "/" is U+002F, so b.md sorts before b/c.md.
    const sorted = [
      ["a.md", "1"],
      ["b.md", "3"],
      ["b/c.md", "2"],
    ];
    expect(normalizeFiles({ "b.md": "3", "b/c.md": "2", "a.md": "1" })).toEqual(sorted);
    expect(
      normalizeFiles(
        new Map([
          ["b/c.md", "2"],
          ["a.md", "1"],
          ["b.md", "3"],
        ]),
      ),
    ).toEqual(sorted);
  });

  test("normalizes CRLF and lone CR to LF", () => {
    expect(normalizeFiles({ "a.md": "one\r\ntwo\rthree\n" })).toEqual([
      ["a.md", "one\ntwo\nthree\n"],
    ]);
  });

  test("throws on two files with the same path", () => {
    expect(() =>
      normalizeFiles([
        ["a.md", "1"],
        ["a.md", "2"],
      ]),
    ).toThrow(TypeError);
  });

  test.each([
    ["/a.md", "begins with /"],
    ["a//b.md", "empty segment"],
    ["./a.md", ". segment"],
    ["a/../b.md", ".. segment"],
    ["a\\b.md", "backslash"],
    ["a\u0000b.md", "U+0000"],
  ])("throws on the path %j (%s)", (path) => {
    expect(() => normalizeFiles({ [path]: "x" })).toThrow(TypeError);
  });

  test("throws when a file's content isn't a string", () => {
    expect(() => normalizeFiles({ "a.md": 1 as unknown as string })).toThrow(TypeError);
  });

  test("doesn't validate the paths of files it ignores", () => {
    expect(normalizeFiles({ "..\\pic.png": "x", "a.md": "A" })).toEqual([["a.md", "A"]]);
  });
});
