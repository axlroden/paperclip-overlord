// Procedural pixel painters. Every sprite is painted once into a tiny canvas and cached as a texture,
// so the whole world needs no image downloads until the CC0/generated atlas replaces pieces of it.
import { Texture } from "pixi.js";

// Endesga 32 palette subset.
export const C = {
  ink: "#181425", night: "#262b44", slate: "#3a4466", steel: "#5a6988", fog: "#8b9bb4", white: "#ffffff",
  cloud: "#c0cbdc", sky: "#2ce8f5", blue: "#0099db", deep: "#124e89",
  red: "#e43b44", blood: "#a22633", dark: "#3e2731", rust: "#be4a2f", orange: "#f77622", amber: "#feae34",
  yellow: "#fee761", lime: "#63c74d", green: "#3e8948", moss: "#265c42", teal: "#193c3e",
  skinA: "#ead4aa", skinB: "#e4a672", skinC: "#b86f50", skinD: "#733e39",
  brown: "#743f39", wood: "#b86f50", sand: "#e8b796", stone: "#c28569", pink: "#f6757a", purple: "#68386c",
  bone: "#e8e0c8", soot: "#2a2a2a", ice: "#9ee7ff", gold: "#feae34",
} as const;

type Paint = (r: (x: number, y: number, w: number, h: number, c: string) => void, ctx: CanvasRenderingContext2D) => void;

const cache = new Map<string, Texture>();

export function tex(key: string, w: number, h: number, paint: Paint): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  paint((x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); }, ctx);
  const t = Texture.from(canvas);
  t.source.scaleMode = "nearest";
  cache.set(key, t);
  return t;
}

/** Bottom-anchored 28x40 divine fist. Open palm while descending, clenched around the whip when striking. */
export function godHand(open: boolean): Texture {
  return tex(`hand:${open}`, 28, 40, (r) => {
    r(7, 0, 14, 12, C.white); r(7, 0, 3, 12, C.cloud); r(6, 10, 16, 3, C.gold); r(6, 12, 16, 1, C.amber);
    r(8, 13, 12, 12, C.skinA); r(8, 13, 2, 12, C.skinB); r(5, 15, 4, 7, C.skinA); r(5, 21, 3, 2, C.skinB);
    if (open) {
      for (let i = 0; i < 4; i++) { r(8 + i * 3, 25, 2, 9 - (i === 0 || i === 3 ? 2 : 0), C.skinA); r(8 + i * 3, 25, 1, 1, C.skinB); }
    } else {
      r(8, 24, 13, 6, C.skinA); for (let i = 0; i < 4; i++) r(9 + i * 3, 24, 1, 6, C.skinB);
      r(20, 22, 3, 10, C.brown); r(21, 31, 2, 6, C.brown); r(20, 21, 3, 1, C.gold);
    }
  });
}

export function plane(): Texture {
  return tex("plane", 8, 5, (r) => { r(0, 2, 8, 1, C.white); r(2, 1, 5, 1, C.white); r(4, 0, 3, 1, C.cloud); r(3, 3, 3, 1, C.cloud); r(1, 4, 2, 1, C.fog); });
}
