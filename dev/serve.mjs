// Serves the dev harness with live rebuilds: npm run harness, then open http://127.0.0.1:4178/?fast
import esbuild from "esbuild";
import { uiExtras } from "../build-plugins.mjs";

const ctx = await esbuild.context({
  ...uiExtras,
  entryPoints: ["dev/harness.tsx"],
  outdir: "dev/out",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: "dev", host: "127.0.0.1", port: Number(process.env.PORT ?? 4178) });
console.log(`harness on http://127.0.0.1:${port}/?fast`);
