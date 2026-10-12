import * as ASSETS from "../generated/assets.js";
import type { Graph, InlineLibraries, Options } from "../types.js";
import { serializeForScript } from "./embed.js";

export type Assets = {
  TEMPLATE: string;
  CSS: string;
  JS: string;
  CSS_SHA256: string;
  JS_SHA256: string;
  LIBS: { cytoscape: { url: string; sri: string }; marked: { url: string; sri: string } };
};

/** What the browser script reads from the data block. */
export type Payload = { name: string; assetBase: string; graph: Graph };

/**
 * Checks `assetBase` (SPEC §5.4) and gives the origin to allow images from:
 * the URL's, when it is an `https:` URL, and none for a relative prefix.
 */
export function assetOrigin(assetBase: string): string | undefined {
  if (typeof assetBase !== "string") throw new TypeError("assetBase isn't a string");
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(assetBase);
  if (!hasScheme) {
    if (assetBase.startsWith("//") || assetBase.includes("\\")) {
      throw new TypeError(`assetBase ${JSON.stringify(assetBase)} isn't a relative prefix`);
    }
    return undefined;
  }
  let url: URL | undefined;
  try {
    url = new URL(assetBase);
  } catch {
    // Reported below.
  }
  if (url === undefined || url.protocol !== "https:" || url.host === "") {
    throw new TypeError(`assetBase ${JSON.stringify(assetBase)} isn't an https: URL`);
  }
  return url.origin;
}

const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Checks the `libraries` option (SPEC §5.3) and gives the libraries to write
 * into the viewer, or undefined when it is to load them from the CDN.
 */
export function inlineLibraries(libraries: Options["libraries"]): InlineLibraries | undefined {
  if (libraries === undefined || libraries === "cdn") return undefined;
  if (typeof libraries !== "object" || libraries === null) {
    throw new TypeError('libraries is neither "cdn" nor the libraries to inline');
  }
  for (const name of ["cytoscape", "marked"] as const) {
    const library = libraries[name];
    if (typeof library?.code !== "string" || typeof library.sha256 !== "string") {
      throw new TypeError(`libraries.${name} needs its code and its hash, as text`);
    }
    if (!SHA256_BASE64.test(library.sha256)) {
      throw new TypeError(`libraries.${name}.sha256 isn't a SHA-256 hash in base64`);
    }
    // Inside a script element, "</script" ends it, "<!--" then "<script" hides
    // the tag that ends it, and a carriage return is rewritten by the parser,
    // after which the text no longer matches its hash.
    const { code } = library;
    if (
      /<\/script/i.test(code) ||
      (code.includes("<!--") && /<script/i.test(code)) ||
      code.includes("\r")
    ) {
      throw new TypeError(`libraries.${name}.code can't be written inside a script element`);
    }
  }
  return libraries;
}

/** The viewer's Content-Security-Policy (SPEC §6). */
export function buildCsp(assets: Assets, imgOrigin?: string, inline?: InlineLibraries): string {
  // Script runs only if it is the viewer's own, by hash, or one of the two
  // libraries: by hash when the viewer carries them, by pinned URL otherwise.
  const libraries =
    inline === undefined
      ? [assets.LIBS.cytoscape.url, assets.LIBS.marked.url]
      : [`'sha256-${inline.cytoscape.sha256}'`, `'sha256-${inline.marked.sha256}'`];
  return [
    "default-src 'none'",
    `script-src ${[...libraries, `'sha256-${assets.JS_SHA256}'`].join(" ")}`,
    `style-src 'sha256-${assets.CSS_SHA256}'`,
    imgOrigin === undefined ? "img-src 'self'" : `img-src 'self' ${imgOrigin}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

const escapeAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The two elements that bring in the libraries, laid out as the template
// indents the place they go.
function libraryElements(assets: Assets, inline?: InlineLibraries): string {
  const elements =
    inline === undefined
      ? [assets.LIBS.cytoscape, assets.LIBS.marked].map(
          ({ url, sri }) =>
            `<script src="${escapeAttribute(url)}" integrity="${escapeAttribute(sri)}" crossorigin="anonymous"></script>`,
        )
      : [inline.cytoscape, inline.marked].map(({ code }) => `<script>${code}</script>`);
  return elements.join("\n    ");
}

/**
 * Writes the viewer. `assets` is a parameter so that a test can build one
 * from a script with the sanitizing steps switched off (SPEC §9, T5).
 */
export function renderViewer(
  payload: Payload,
  libraries?: Options["libraries"],
  assets: Assets = ASSETS,
): string {
  const inline = inlineLibraries(libraries);
  const values: Record<string, string> = {
    CSP: escapeAttribute(buildCsp(assets, assetOrigin(payload.assetBase), inline)),
    CSS: assets.CSS,
    JS: assets.JS,
    DATA: serializeForScript(payload),
    LIBRARIES: libraryElements(assets, inline),
  };
  // One pass with a function: text that has been put in is never scanned for
  // a placeholder, nor read as a replacement pattern such as "$&".
  return assets.TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Unknown template placeholder ${name}`);
    return value;
  });
}
