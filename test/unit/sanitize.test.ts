// @vitest-environment happy-dom

// SPEC §6: what a rendered body may hold. These run against a DOM emulation;
// test/browser/security.spec.ts makes the same claims in real browsers.

import * as marked from "marked";
import { beforeAll, describe, expect, test } from "vitest";
import { resolveConceptId } from "../../src/core/links.js";
import { renderBody } from "../../src/viewer/sanitize.js";

beforeAll(() => {
  Object.assign(globalThis, { marked, __OKF_SANITIZE__: true });
});

const concepts = new Set(["tables/orders", "tables/customers", "notes/my file", "top"]);

function render(markdown: string, assetBase = ""): HTMLElement {
  const host = document.createElement("div");
  host.append(
    renderBody(markdown, {
      conceptDir: "tables",
      resolve: (target, fromDir) => resolveConceptId(target, fromDir, (id) => concepts.has(id)),
      assetBase,
    }),
  );
  return host;
}

describe("markdown", () => {
  test("renders headings, emphasis, lists, code and tables", () => {
    const host = render(
      "# Title\n\nSome *emphasis* and **strong** and `code`.\n\n- one\n- two\n\n```sql\nSELECT 1;\n```\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n\n> quoted\n",
    );
    expect(host.querySelector("h1")?.textContent).toBe("Title");
    expect(host.querySelector("em")?.textContent).toBe("emphasis");
    expect(host.querySelector("strong")?.textContent).toBe("strong");
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelector("pre code")?.getAttribute("class")).toBe("language-sql");
    expect(host.querySelector("pre code")?.textContent).toBe("SELECT 1;\n");
    expect(host.querySelectorAll("td")).toHaveLength(2);
    expect(host.querySelector("th")?.getAttribute("align")).toBe("left");
    expect(host.querySelector("blockquote")?.textContent?.trim()).toBe("quoted");
  });

  test("a task list keeps its checkboxes, disabled", () => {
    const boxes = render("- [x] done\n- [ ] todo\n").querySelectorAll("input");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.getAttribute("type")).toBe("checkbox");
      expect(box.hasAttribute("disabled")).toBe(true);
    }
    expect(boxes[0]?.hasAttribute("checked")).toBe(true);
  });
});

describe("raw HTML in a body", () => {
  test.each([
    "<script>alert(1)</script>",
    '<img src="x" onerror="alert(1)">',
    "<iframe src='https://example.com'></iframe>",
    '<a href="javascript:alert(1)">x</a>',
    "<style>body { display: none }</style>",
    "<svg onload=alert(1)></svg>",
    '<form action="https://example.com"><button>go</button></form>',
    "text with <b onclick='alert(1)'>inline</b> html",
    "<!-- a comment -->",
    '<div><p>nested <span style="color:red">block</span></p></div>',
  ])("%s is displayed as text", (raw) => {
    const host = render(raw);
    expect(host.textContent).toContain(raw);
    expect(
      host.querySelector("script, img, iframe, a, style, svg, form, button, b, span, div"),
    ).toBeNull();
    for (const node of host.querySelectorAll("*")) {
      for (const name of node.getAttributeNames()) expect(name).not.toMatch(/^on|^style$/);
    }
  });
});

describe("links", () => {
  test("a link to a concept is followed inside the viewer", () => {
    const link = render("[c](customers.md)").querySelector("a");
    expect(link?.getAttribute("data-concept")).toBe("tables/customers");
    expect(link?.getAttribute("href")).toBe("#");
    expect(link?.className).toBe("internal");
    expect(link?.hasAttribute("target")).toBe(false);
  });

  test.each([
    ["[c](./customers.md)", "tables/customers"],
    ["[c](/tables/customers.md)", "tables/customers"],
    ["[c](../top.md)", "top"],
    ["[c](customers.md#schema)", "tables/customers"],
    ["[c](../notes/my%20file.md)", "notes/my file"],
    ["[c](<../notes/my file.md>)", "notes/my file"],
  ])("%s goes to %s", (markdown, id) => {
    expect(render(markdown).querySelector("a")?.getAttribute("data-concept")).toBe(id);
  });

  test("an https link opens elsewhere and doesn't hand over the viewer", () => {
    const link = render("[site](https://example.com/a?b=1#c)").querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/a?b=1#c");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.className).toBe("external");
  });

  test("a bare https URL is linked the same way", () => {
    const link = render("See https://example.com/page for more.").querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/page");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test.each([
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](&#106;avascript:alert(1))",
    "[x](java&#10;script:alert(1))",
    "[x](data:text/html,<script>alert(1)</script>)",
    "[x](vbscript:msgbox(1))",
    "[x](http://example.com/insecure)",
    "[x](//example.com/protocol-relative)",
    "[x](mailto:someone@example.com)",
    "[x](file:///etc/passwd)",
    "[x](missing.md)",
    "[x](../../outside.md)",
    "[x](some/other/page.html)",
    "[x](#fragment)",
    "[x]()",
  ])("%s is left as its text", (markdown) => {
    const host = render(markdown);
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent?.trim()).toBe("x");
  });

  test("a destination that begins with a control character isn't a link at all", () => {
    const host = render("[x](\u0001javascript:alert(1))");
    expect(host.querySelector("a")).toBeNull();
  });

  test("a link that is removed keeps the formatting of its text", () => {
    const host = render("[*important* `code`](javascript:alert(1))");
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("em")?.textContent).toBe("important");
    expect(host.querySelector("code")?.textContent).toBe("code");
  });

  test("a link's title is kept as text", () => {
    const link = render('[c](customers.md "the \\"customers\\" table")').querySelector("a");
    expect(link?.getAttribute("title")).toBe('the "customers" table');
  });
});

describe("images", () => {
  test("an image with a relative path is shown, resolved against the concept's directory", () => {
    const image = render("![diagram](img/flow.png)").querySelector("img");
    expect(image?.getAttribute("src")).toBe("tables/img/flow.png");
    expect(image?.getAttribute("alt")).toBe("diagram");
  });

  test.each([
    ["![d](../shared/a.png)", "shared/a.png"],
    ["![d](/shared/a.png)", "shared/a.png"],
    ["![d](./a%20b.png)", "tables/a%20b.png"],
    ["![d](<a b.png>)", "tables/a%20b.png"],
    ["![d](./a:b.png)", "tables/a%3Ab.png"],
    // A backslash is part of a file's name here, never a separator.
    ["![d](\\\\server\\share\\a.png)", "tables/%5Cserver%5Cshare%5Ca.png"],
  ])("%s loads %s", (markdown, src) => {
    expect(render(markdown).querySelector("img")?.getAttribute("src")).toBe(src);
  });

  test("the asset base is put before the path", () => {
    expect(render("![d](a.png)", "../bundle/").querySelector("img")?.getAttribute("src")).toBe(
      "../bundle/tables/a.png",
    );
    expect(
      render("![d](a.png)", "https://cdn.example.com/b/").querySelector("img")?.getAttribute("src"),
    ).toBe("https://cdn.example.com/b/tables/a.png");
  });

  test("an image with an https URL isn't loaded: it becomes a link", () => {
    const host = render("![a chart](https://example.com/chart.png)");
    expect(host.querySelector("img")).toBeNull();
    const link = host.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/chart.png");
    expect(link?.textContent).toBe("a chart");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test.each([
    "![alt text](http://example.com/a.png)",
    "![alt text](//example.com/a.png)",
    "![alt text](data:image/png;base64,AAAA)",
    "![alt text](javascript:alert(1))",
    "![alt text](../../outside.png)",
    // "a:" reads as a URL scheme, so this is a URL, and not an https one.
    "![alt text](a:b.png)",
  ])("%s is shown as its alternative text", (markdown) => {
    const host = render(markdown);
    expect(host.querySelector("img, a")).toBeNull();
    expect(host.textContent?.trim()).toBe("alt text");
  });
});

describe("a body that can't be rendered", () => {
  test("is shown as plain text", () => {
    Object.assign(globalThis, {
      marked: {
        Marked: class {
          parse() {
            throw new Error("too deep");
          }
        },
      },
    });
    try {
      const host = render("# Still **readable**");
      expect(host.textContent).toBe("# Still **readable**");
      expect(host.querySelector("h1")).toBeNull();
    } finally {
      Object.assign(globalThis, { marked });
    }
  });
});
