// Bundles the companion app to a single CommonJS file for `pkg` to package
// into a standalone .exe. Kept separate from the tsc-based `npm run build` /
// `npm start` dev flow - this is only for producing the distributable exe.
// Everything here is pure JS (systray2's native part is a spawned
// subprocess, not a require()'d .node addon), so a plain bundle with no
// externals is safe - node-simconnect (native, unused/dead code - see
// src/simconnect/loadFlightPlan.ts) is never reached from src/index.ts, so
// esbuild's tree-shaking drops it automatically.
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "dist-bundle/index.cjs",
  })
  .then(() => console.log("Bundled to dist-bundle/index.cjs"))
  .catch(() => process.exit(1));
