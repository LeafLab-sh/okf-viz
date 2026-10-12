// Renders a concept's body. Bundle text is untrusted (SPEC §6), so there are
// two steps here, and the Content-Security-Policy behind them:
//
//   1. marked is told to write raw HTML as text.
//   2. Its output is parsed into an inert <template> and walked: only the
//      elements and attributes markdown itself produces are kept, and every
//      link and image is checked against where it may go.

import { resolvePath } from "../core/links.js";

// marked, loaded by the script element before the viewer's own.
declare const marked: {
  Marked: new (options: unknown) => { parse(markdown: string): string };
};

// False only in the build that test T5 uses, to show that the policy alone
// still stops injected script. See scripts/build-assets.mjs.
declare const __OKF_SANITIZE__: boolean;

export type BodyContext = {
  /** The directory of the concept whose body this is: '' for the bundle root. */
  conceptDir: string;
  /** The ID of the concept a link target names, or null. */
  resolve(target: string, fromDir: string): string | null;
  /** The prefix for relative image paths. */
  assetBase: string;
};

const XHTML = "http://www.w3.org/1999/xhtml";

// The attributes kept on each element that is kept. Anything else on the
// page came from somewhere other than markdown.
const ALLOWED: Record<string, readonly string[]> = {
  p: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ["start"],
  li: [],
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  code: ["class"],
  pre: [],
  blockquote: [],
  em: [],
  strong: [],
  del: [],
  hr: [],
  br: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ["align"],
  td: ["align"],
  input: ["type", "checked", "disabled"],
};

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The URL, normalized, if the text is an absolute `https:` URL. */
function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function externalLink(href: string, label: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.textContent = label;
  a.setAttribute("href", href);
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
  a.className = "external";
  return a;
}

function checkLink(a: Element, context: BodyContext): void {
  const href = a.getAttribute("href") ?? "";

  // A concept of this bundle, with or without a fragment.
  for (const target of new Set([href, href.split("#")[0] as string])) {
    const concept = target === "" ? null : context.resolve(target, context.conceptDir);
    if (concept !== null) {
      a.setAttribute("href", "#");
      a.setAttribute("data-concept", concept);
      a.className = "internal";
      return;
    }
  }

  const url = httpsUrl(href);
  if (url !== null) {
    a.setAttribute("href", url);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.className = "external";
    return;
  }

  // Any other scheme, and any path that isn't a concept: the text stays.
  a.replaceWith(...Array.from(a.childNodes));
}

function checkImage(img: Element, context: BodyContext): void {
  const src = img.getAttribute("src") ?? "";
  const alt = img.getAttribute("alt") ?? "";

  let isUrl = true;
  try {
    new URL(src);
  } catch {
    isUrl = false;
  }

  if (!isUrl && !src.startsWith("//") && !src.includes("\\")) {
    // A path: shown if it stays inside the bundle (SPEC §5.4).
    const path = resolvePath(decode(src.split(/[?#]/)[0] as string), context.conceptDir);
    if (path !== null) {
      img.setAttribute(
        "src",
        context.assetBase + path.split("/").map(encodeURIComponent).join("/"),
      );
      return;
    }
  }

  // An absolute URL isn't loaded, so that opening a viewer doesn't contact a
  // server the bundle names.
  const url = httpsUrl(src);
  if (url !== null) img.replaceWith(externalLink(url, alt || url));
  else img.replaceWith(document.createTextNode(alt));
}

function sanitize(parent: ParentNode, context: BodyContext): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      continue;
    }
    const element = node as Element;
    const name = element.localName;
    const attributes = element.namespaceURI === XHTML ? ALLOWED[name] : undefined;
    if (attributes === undefined || !Object.hasOwn(ALLOWED, name)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ""));
      continue;
    }

    for (const attribute of element.getAttributeNames()) {
      if (!attributes.includes(attribute)) element.removeAttribute(attribute);
    }
    sanitize(element, context);

    if (name === "a") checkLink(element, context);
    else if (name === "img") checkImage(element, context);
    else if (name === "input") {
      if (element.getAttribute("type") === "checkbox") element.setAttribute("disabled", "");
      else element.remove();
    } else if (name === "code") {
      if (!/^language-[\w-]+$/.test(element.getAttribute("class") ?? "")) {
        element.removeAttribute("class");
      }
    } else if (name === "th" || name === "td") {
      if (!/^(left|right|center)$/.test(element.getAttribute("align") ?? "")) {
        element.removeAttribute("align");
      }
    } else if (name === "ol") {
      if (!/^\d{1,9}$/.test(element.getAttribute("start") ?? "")) element.removeAttribute("start");
    }
  }
}

function plainText(markdown: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const pre = document.createElement("pre");
  pre.textContent = markdown;
  fragment.append(pre);
  return fragment;
}

/** A concept's body, ready to show. */
export function renderBody(markdown: string, context: BodyContext): DocumentFragment {
  try {
    const renderer = __OKF_SANITIZE__ ? { html: (html: string) => escapeHtml(html) } : {};
    const html = new marked.Marked({ gfm: true, breaks: false, async: false, renderer }).parse(
      markdown,
    );
    // A template's content belongs to a document without a browsing context:
    // nothing in it loads or runs while it is checked.
    const template = document.createElement("template");
    template.innerHTML = html;
    if (__OKF_SANITIZE__) sanitize(template.content, context);
    return template.content;
  } catch {
    // A body too deeply nested for the parser, say. It is still readable.
    return plainText(markdown);
  }
}
