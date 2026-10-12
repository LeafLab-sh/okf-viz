import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test as base, type Page } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));

// The two library URLs a viewer may request, served from node_modules so the
// tests need no network and the integrity hashes are checked against the
// bytes npm published.
const LIBRARIES: Record<string, string> = {
  "https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.min.js":
    "node_modules/cytoscape/dist/cytoscape.min.js",
  "https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js": "node_modules/marked/marked.min.js",
};

/**
 * Playwright's test, with one change: closing a context in Firefox on Windows
 * sometimes fails inside the browser's session store after the test has
 * finished. That error says nothing about the page, so it alone is ignored.
 * Retries aren't used for this, since they would also hide an intermittent
 * failure of a security assertion.
 */
export const test = base.extend({
  context: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    await use(context);
    try {
      await context.close();
    } catch (error) {
      if (!String(error).includes("_maybeDontRestoreTabs")) throw error;
    }
  },
});

/** A 1x1 PNG, for tests that need an image file beside the viewer. */
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export type Via = "file" | "http";

export type Opened = {
  url: string;
  /**
   * Every request the page began other than for the viewer file itself. A
   * browser may list here a request its own policy then refused.
   */
  requests: string[];
  /** The requests that left the page for the network, refused ones excluded. */
  sent: string[];
  /** Uncaught exceptions and console errors. */
  errors: string[];
  /** Content-Security-Policy violations, as "directive blocked-uri". */
  violations: string[];
  close(): Promise<void>;
};

export type OpenOptions = {
  via: Via;
  /** Files written beside viz.html, by relative path. */
  files?: Record<string, string | Uint8Array>;
  /** Abort the library requests, as when the reader is offline. */
  offline?: boolean;
  /** Fix the browser's clock at this instant. */
  now?: Date;
};

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  png: "image/png",
  js: "text/javascript",
};

function serve(dir: string): Promise<Server> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    try {
      const body = readFileSync(join(dir, path));
      const extension = path.slice(path.lastIndexOf(".") + 1);
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** Opens a generated viewer in the page and records what it did. */
export async function openViewer(page: Page, html: string, options: OpenOptions): Promise<Opened> {
  const dir = mkdtempSync(join(tmpdir(), "okf-viz-"));
  writeFileSync(join(dir, "viz.html"), html);
  for (const [path, content] of Object.entries(options.files ?? {})) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }

  let server: Server | undefined;
  let url: string;
  if (options.via === "http") {
    server = await serve(dir);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no server address");
    url = `http://127.0.0.1:${address.port}/viz.html`;
  } else {
    url = pathToFileURL(join(dir, "viz.html")).href;
  }

  const requests: string[] = [];
  const sent: string[] = [];
  const errors: string[] = [];
  const violations: string[] = [];

  page.on("request", (request) => {
    if (request.url() !== url) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.exposeFunction("__okfViolation", (text: string) => {
    violations.push(text);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __okfViolation(text: string): void }).__okfViolation(
        `${event.effectiveDirective} ${event.blockedURI}`,
      );
    });
  });

  await page.route("https://**/*", async (route) => {
    sent.push(route.request().url());
    const file = LIBRARIES[route.request().url()];
    if (file === undefined || options.offline) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: readFileSync(root + file),
    });
  });
  await page.route("http://**/*", async (route) => {
    if (route.request().url() !== url) sent.push(route.request().url());
    if (route.request().url().startsWith("http://127.0.0.1:")) await route.continue();
    else await route.abort();
  });

  if (options.now !== undefined) await page.clock.setFixedTime(options.now);

  await page.goto(url);

  return {
    url,
    requests,
    sent,
    errors,
    violations,
    close: async () => {
      await page.close();
      if (server !== undefined) await new Promise((resolve) => server.close(resolve));
    },
  };
}

export const LIBRARY_URLS = Object.keys(LIBRARIES);
