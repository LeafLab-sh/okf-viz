import { defineConfig } from "tsup";

// Declarations come from tsc (tsconfig.build.json): tsup's bundler for them
// doesn't run on TypeScript 7.
export default defineConfig([
  {
    // The library: no Node, no filesystem (SPEC §2). A Node built-in imported
    // from here fails this build.
    // `inline` is the libraries themselves, kept out of `index` (see
    // src/inline.ts).
    entry: { index: "src/index.ts", inline: "src/inline.ts" },
    // Each entry is one file that imports nothing of the other.
    splitting: false,
    format: ["esm"],
    target: "es2022",
    platform: "neutral",
    dts: false,
    // dist/ is emptied by the build script: the two entries build at once.
    clean: false,
    sourcemap: false,
  },
  {
    // The command, for Node. It carries its own copy of the library.
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    dts: false,
    clean: false,
    sourcemap: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
