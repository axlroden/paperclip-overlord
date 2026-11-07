import fs from "node:fs";
import path from "node:path";

// The quip bank is optional at build time: a missing quips/quips.json resolves to an empty bank.
export const quipsPlugin = {
  name: "overlord-quips",
  setup(build) {
    build.onResolve({ filter: /^overlord-quips$/ }, () => {
      const file = path.resolve("quips/quips.json");
      return fs.existsSync(file) ? { path: file } : { path: "empty", namespace: "overlord-quips" };
    });
    build.onLoad({ filter: /.*/, namespace: "overlord-quips" }, () => ({ contents: "[]", loader: "json" }));
  },
};

export const uiExtras = { jsx: "automatic", loader: { ".png": "dataurl", ".css": "text" }, plugins: [quipsPlugin] };
