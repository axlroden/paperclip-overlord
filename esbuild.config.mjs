import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";
import { uiExtras } from "./build-plugins.mjs";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx", minify: true });
// The host rewrites bare imports by matching ` from "react"` literally (ui/src/plugins/slots.tsx),
// so the UI bundle must keep whitespace: minify names and syntax only.
const uiMinify = { minify: false, minifyIdentifiers: true, minifySyntax: true };
const watch = process.argv.includes("--watch");
const ctxs = await Promise.all([
  esbuild.context(presets.esbuild.worker),
  esbuild.context(presets.esbuild.manifest),
  esbuild.context({ ...presets.esbuild.ui, ...uiMinify, ...uiExtras }),
]);

if (watch) {
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching worker, manifest, ui");
} else {
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.dispose()));
}
