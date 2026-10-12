import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { serializeForScript } from "../../src/core/embed.js";
import { buildGraph } from "../../src/core/graph.js";
import { LIBS } from "../../src/generated/assets.js";
import { generateViewer } from "../../src/index.js";
import { readBundle } from "../helpers/fixtures.js";

const sha256 = (text: string) => createHash("sha256").update(text).digest("base64");

const dataOf = (html: string) => {
  const match = /<script type="application\/json" id="okf-data">(.*?)<\/script>/s.exec(html);
  if (match === null) throw new Error("no data block");
  return match[1] as string;
};
const cspOf = (html: string) => {
  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (match === null) throw new Error("no policy");
  return match[1] as string;
};

describe("serializeForScript", () => {
  test("writes the characters that could end a script element as escapes", () => {
    const text = serializeForScript({ body: "</script><!-- & \u2028\u2029 >" });
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual({ body: "</script><!-- & \u2028\u2029 >" });
  });

  test("leaves other text as JSON writes it", () => {
    expect(serializeForScript({ a: 'é "quoted" \\ /' })).toBe('{"a":"é \\"quoted\\" \\\\ /"}');
  });
});

describe("generateViewer", () => {
  const files = readBundle("edge");

  test("embeds the name, the asset base and the graph as data", () => {
    const { html } = generateViewer({ name: "Edge cases", files, options: { assetBase: "img/" } });
    expect(JSON.parse(dataOf(html))).toEqual({
      name: "Edge cases",
      assetBase: "img/",
      graph: buildGraph(files),
    });
  });

  test("reports what it built", () => {
    const { html, stats } = generateViewer({ name: "Edge cases", files });
    expect(stats).toEqual({
      concepts: 4,
      edges: 4,
      skipped: 2,
      bytes: new TextEncoder().encode(html).length,
    });
  });

  test("the same input gives the same bytes", () => {
    const a = generateViewer({ name: "N", files });
    const b = generateViewer({ name: "N", files: Object.entries(files).reverse() });
    expect(b.html).toBe(a.html);
  });

  test("an empty bundle gives a viewer with an empty graph", () => {
    const { html, stats } = generateViewer({ name: "Empty", files: { "index.md": "# Nothing" } });
    expect(stats).toMatchObject({ concepts: 0, edges: 0, skipped: 0 });
    expect(JSON.parse(dataOf(html)).graph.nodes).toEqual([]);
  });

  test("bundle text can't end the element that holds it, or open another", () => {
    const hostile = "</script><script>alert(1)</script><!-- <img src=x onerror=alert(1)> &amp;";
    const clean = generateViewer({ name: "N", files: {} }).html;
    const { html } = generateViewer({
      name: hostile,
      files: {
        "a.md": `---\ntitle: "${hostile.replaceAll('"', '\\"')}"\ntype: T\n---\n${hostile}\n`,
      },
    });
    const count = (text: string, needle: string) => text.split(needle).length - 1;
    for (const needle of ["<script", "</script", "<!--", "<img", "alert(1)"]) {
      // The name, the title and the body each hold the text once, as data.
      const expected =
        count(clean, needle) + (needle === "alert(1)" ? 3 * count(hostile, needle) : 0);
      expect(count(html, needle), needle).toBe(expected);
    }
    const data = JSON.parse(dataOf(html));
    expect(data.name).toBe(hostile);
    expect(data.graph.nodes[0].data.label).toBe(hostile);
    expect(data.graph.bodies.a).toBe(hostile);
  });

  test("bundle text that looks like a template placeholder or a replacement pattern stays text", () => {
    const tricky = "{{JS}} {{CSS}} {{DATA}} {{CSP}} $& $1 $` $'";
    const { html } = generateViewer({ name: tricky, files: { "a.md": `${tricky}\n` } });
    const data = JSON.parse(dataOf(html));
    expect(data.name).toBe(tricky);
    expect(data.graph.bodies.a).toBe(`${tricky}\n`);
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}(?![^<]*<\/script>)/);
  });

  describe("the Content-Security-Policy", () => {
    const { html } = generateViewer({ name: "N", files });
    const csp = cspOf(html);

    test("comes before anything that loads or runs", () => {
      expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
      expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<style"));
    });

    test("names the inline script and stylesheet by the hash of what was written", () => {
      const style = /<style[^>]*>(.*?)<\/style>/s.exec(html)?.[1] as string;
      const script = /<script>(.*?)<\/script>/s.exec(html)?.[1] as string;
      expect(style.length).toBeGreaterThan(0);
      expect(script.length).toBeGreaterThan(0);
      expect(csp).toContain(`style-src 'sha256-${sha256(style)}'`);
      expect(csp).toContain(`'sha256-${sha256(script)}'`);
    });

    test("allows script only by that hash and from the two pinned URLs", () => {
      const directive = csp.split("; ").find((d) => d.startsWith("script-src ")) as string;
      expect(directive.split(" ").slice(1, 3)).toEqual([LIBS.cytoscape.url, LIBS.marked.url]);
      expect(csp).not.toContain("unsafe");
    });

    test("allows nothing else", () => {
      for (const directive of [
        "default-src 'none'",
        "img-src 'self'",
        "connect-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ]) {
        expect(csp.split("; ")).toContain(directive);
      }
    });

    test("pins each library with an integrity hash", () => {
      for (const library of [LIBS.cytoscape, LIBS.marked]) {
        expect(html).toContain(
          `<script src="${library.url}" integrity="${library.sri}" crossorigin="anonymous"></script>`,
        );
      }
    });
  });

  describe("assetBase", () => {
    test.each(["", "img/", "../assets/", "/bundles/a/"])("%j is a relative prefix", (assetBase) => {
      const { html } = generateViewer({ name: "N", files, options: { assetBase } });
      expect(cspOf(html).split("; ")).toContain("img-src 'self'");
    });

    test("an https URL adds its origin to the image sources", () => {
      const { html } = generateViewer({
        name: "N",
        files,
        options: { assetBase: "https://cdn.example.com:8443/bundles/a/" },
      });
      expect(cspOf(html).split("; ")).toContain("img-src 'self' https://cdn.example.com:8443");
    });

    test.each([
      "http://example.com/",
      "javascript:alert(1)//",
      "data:image/png;base64,",
      "//example.com/",
      "\\\\example.com\\",
      "https://",
      "file:///c:/",
    ])("%j is a malformed call", (assetBase) => {
      expect(() => generateViewer({ name: "N", files, options: { assetBase } })).toThrow(TypeError);
    });
  });

  test("a name that isn't a string is a malformed call", () => {
    expect(() => generateViewer({ name: 1 as unknown as string, files })).toThrow(TypeError);
  });
});
