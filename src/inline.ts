// The package's `inline` entry: the two libraries a viewer needs, to pass as
// the `libraries` option when a viewer is to carry them and load nothing.
//
//   import { generateViewer } from "@leaflab-sh/okf-viz";
//   import { inlineLibraries } from "@leaflab-sh/okf-viz/inline";
//
//   generateViewer({ name, files, options: { libraries: inlineLibraries } });
//
// It is kept apart from the main entry because the libraries are about 400 kB,
// which a caller who loads them from the CDN has no reason to carry.

import { INLINE_LIBRARIES } from "./generated/libraries.js";
import type { InlineLibraries } from "./types.js";

/** Cytoscape.js and marked, at the versions the viewer is built for. */
export const inlineLibraries: InlineLibraries = INLINE_LIBRARIES;

export type { InlineLibraries, InlineLibrary } from "./types.js";
