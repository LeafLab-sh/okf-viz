// A Worker that uses the built package the way a consumer would.

import { generateRepoViewer, generateViewer } from "../../dist/index.js";
import { inlineLibraries } from "../../dist/inline.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const { inline, ...input } = (await request.json()) as any;
    if (inline) input.options = { ...input.options, libraries: inlineLibraries };
    const result = "bundles" in input ? generateRepoViewer(input) : generateViewer(input);
    return new Response(result.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-okf-stats": JSON.stringify(result.stats),
        // What the runtime offers: proof that this isn't Node in disguise.
        "x-has-process-versions-node": String(
          typeof (globalThis as any).process?.versions?.node === "string",
        ),
      },
    });
  },
};
