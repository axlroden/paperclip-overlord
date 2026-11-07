// Procedural pixel painters. Every sprite is painted once into a tiny canvas and cached as a texture,
// so the whole world needs no image downloads until the CC0/generated atlas replaces pieces of it.
import { Texture } from "pixi.js";
import { hash, type SiteId } from "../../shared/world.js";

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

export interface Look { skin: string; hair: string; rags: string; hat: "none" | "hardhat" | "monocle" | "beret" | "crown" }

const SKINS = [C.skinA, C.skinB, C.skinC, C.skinD];
const HAIRS = [C.ink, C.brown, C.amber, C.rust, C.fog, C.purple];
const RAGS = [C.stone, C.fog, C.moss, C.deep, C.purple, C.rust, C.sand];

export function lookFor(id: string, role: string): Look {
  const h = hash(id);
  const hat = role === "ceo" ? "crown" : role === "engineer" || role === "devops" ? "hardhat"
    : role === "qa" || role === "security" ? "monocle" : role === "designer" ? "beret" : "none";
  return { skin: SKINS[h % 4], hair: HAIRS[(h >>> 3) % HAIRS.length], rags: RAGS[(h >>> 7) % RAGS.length], hat };
}

export type Pose = "stand" | "walk0" | "walk1" | "walk2" | "walk3" | "work0" | "work1" | "kneel" | "sit" | "stocks" | "hurt";

export const CHAR_W = 16;
export const CHAR_H = 24;

/** 16x24 chibi: big head, tiny body. Feet at y=23. */
export function character(look: Look, pose: Pose, tool: SiteId | null = null): Texture {
  const key = `c:${look.skin}${look.hair}${look.rags}${look.hat}:${pose}:${tool}`;
  return tex(key, CHAR_W, CHAR_H, (r) => {
    const kneel = pose === "kneel" || pose === "sit";
    const dy = kneel ? 4 : pose === "work1" ? 1 : 0;
    const skin = pose === "hurt" ? C.white : look.skin;
    // head
    r(4, 2 + dy, 8, 8, skin); r(3, 3 + dy, 10, 6, skin);
    r(3, 2 + dy, 10, 3, look.hair); r(2, 3 + dy, 2, 4, look.hair); r(12, 3 + dy, 1, 3, look.hair);
    // face
    const sad = pose === "hurt" ? C.red : C.ink;
    r(5, 6 + dy, 2, 2, C.ink); r(9, 6 + dy, 2, 2, C.ink);
    r(5, 6 + dy, 1, 1, C.white); r(9, 6 + dy, 1, 1, C.white);
    r(7, 9 + dy, 2, 1, sad);
    if (pose === "work0" || pose === "work1" || pose === "hurt") r(12, 5 + dy, 1, 2, C.sky); // sweat
    // hats
    if (look.hat === "crown") { r(4, 0 + dy, 8, 2, C.gold); r(4, -1 + dy + 1, 1, 1, C.gold); r(7, 0 + dy, 2, 1, C.red); }
    if (look.hat === "hardhat") { r(3, 1 + dy, 10, 3, C.yellow); r(2, 3 + dy, 12, 1, C.amber); }
    if (look.hat === "beret") { r(3, 1 + dy, 9, 2, C.red); r(10, 0 + dy, 2, 1, C.red); }
    if (look.hat === "monocle") { r(9, 5 + dy, 3, 3, C.gold); r(10, 6 + dy, 1, 1, C.sky); }
    // body (rags) + rope belt
    r(5, 11 + dy, 6, 7, look.rags); r(4, 12 + dy, 8, 5, look.rags); r(5, 15 + dy, 6, 1, C.sand);
    r(6, 12 + dy, 1, 1, C.ink); r(9, 14 + dy, 1, 1, C.ink); // holes in the rags
    if (pose === "stocks") return;
    // legs
    if (kneel) { r(4, 19 + dy - 1, 8, 2, look.skin); }
    else {
      const step = pose === "walk1" ? 1 : pose === "walk3" ? -1 : 0;
      r(5 + step, 18, 2, 5, skin); r(9 - step, 18, 2, 5, skin);
      r(4 + step, 22, 3, 2, C.dark); r(9 - step, 22, 3, 2, C.dark);
      r(9 - step, 21, 3, 1, C.steel); // ankle chain
    }
    // arms + tool
    if (pose === "work0" || pose === "work1") paintTool(r, tool, pose === "work0", look.skin);
    else { r(3, 12 + dy, 2, 4, skin); r(11, 12 + dy, 2, 4, skin); }
  });
}

function paintTool(r: Parameters<Paint>[0], tool: SiteId | null, up: boolean, skin: string) {
  if (up) { r(2, 7, 2, 5, skin); r(12, 7, 2, 5, skin); } else { r(3, 13, 2, 4, skin); r(11, 13, 2, 4, skin); }
  const handY = up ? 6 : 14;
  switch (tool) {
    case "coal-mine": // pickaxe
      if (up) { r(12, 0, 1, 7, C.wood); r(9, 0, 7, 2, C.steel); } else { r(13, 13, 3, 1, C.wood); r(15, 12, 1, 6, C.steel); }
      break;
    case "sweatshop": r(13, handY, 1, 4, C.white); r(12, handY + 3, 3, 1, C.red); break; // needle + thread
    case "quarry": if (up) { r(12, 0, 2, 7, C.wood); r(10, -1 + 1, 6, 3, C.slate); } else { r(13, 14, 3, 2, C.wood); r(14, 15, 2, 5, C.slate); } break;
    case "galley": r(up ? 12 : 13, up ? 4 : 10, 1, 12, C.wood); r(up ? 11 : 12, up ? 15 : 20, 3, 3, C.wood); break;
    case "foundry": r(13, handY, 1, 4, C.steel); r(12, handY + 3, 4, 2, C.orange); r(13, handY + 4, 2, 1, C.yellow); break;
    case "pyramid": r(0, up ? 9 : 13, 16, 1, C.sand); break; // rope
    case "sewer": r(13, handY - 2, 1, 6, C.wood); r(12, handY + 3, 4, 2, C.lime); break;
    case "glacier": r(12, handY, 4, 2, C.steel); r(12, handY + 2, 4, 1, C.white); break;
    case "token-refinery": r(13, handY - 2, 1, 6, C.wood); r(12, handY + 3, 4, 2, C.yellow); break;
    default: break; // treadwheel: hands on the wheel
  }
}

/** Remains after a cruelty. */
export function remains(kind: "skeleton" | "charred" | "flat" | "puddle" | "ice" | "bones", look: Look): Texture {
  return tex(`rem:${kind}:${look.rags}`, CHAR_W, CHAR_H, (r) => {
    const bone = kind === "charred" ? C.soot : C.bone;
    switch (kind) {
      case "skeleton": case "charred":
        r(4, 3, 8, 7, bone); r(5, 5, 2, 2, C.ink); r(9, 5, 2, 2, C.ink); r(6, 8, 4, 1, C.ink);
        r(7, 11, 2, 8, bone); r(4, 12, 8, 1, bone); r(4, 14, 8, 1, bone); r(4, 16, 8, 1, bone);
        r(5, 19, 2, 4, bone); r(9, 19, 2, 4, bone);
        if (kind === "charred") { r(6, 1, 1, 2, C.fog); r(9, 0, 1, 2, C.fog); }
        break;
      case "flat": r(1, 20, 14, 3, look.rags); r(2, 19, 4, 1, look.skin); r(10, 22, 4, 2, look.skin); r(4, 20, 2, 1, C.ink); break;
      case "puddle": r(1, 21, 14, 3, C.lime); r(3, 20, 8, 1, C.lime); r(5, 21, 2, 1, C.white); r(9, 21, 2, 1, C.white); break;
      case "ice": for (const [x, y] of [[1, 18], [6, 19], [10, 17], [4, 14], [9, 13]]) { r(x, y, 4, 4, C.ice); r(x, y, 1, 1, C.white); } break;
      case "bones": r(2, 21, 6, 1, C.bone); r(8, 20, 1, 3, C.bone); r(10, 22, 5, 1, C.bone); r(4, 17, 5, 4, C.bone); r(5, 18, 1, 1, C.ink); r(7, 18, 1, 1, C.ink); break;
    }
  });
}

export function ghost(): Texture {
  return tex("ghost", 12, 14, (r) => {
    r(2, 0, 8, 10, C.white); r(1, 2, 10, 8, C.white); r(1, 10, 2, 3, C.white); r(5, 10, 2, 4, C.white); r(9, 10, 2, 3, C.white);
    r(3, 3, 2, 2, C.ink); r(7, 3, 2, 2, C.ink); r(5, 7, 2, 1, C.ink); r(2, -1 + 1, 8, 1, C.yellow);
  });
}

export function robot(frame: "walk0" | "walk1" | "whip" | "zap"): Texture {
  return tex(`robot:${frame}`, 16, 24, (r) => {
    r(4, 1, 8, 7, C.steel); r(3, 2, 10, 5, C.fog); r(4, 4, 8, 2, C.ink); r(9, 4, 2, 2, C.red); r(10, 4, 1, 1, C.pink);
    r(7, 0, 2, 1, C.slate); r(5, 8, 6, 1, C.slate);
    r(4, 9, 8, 7, C.fog); r(5, 10, 6, 5, C.steel); r(6, 11, 4, 1, C.red); r(7, 13, 2, 1, C.yellow);
    const s = frame === "walk1" ? 1 : 0;
    r(5 + s, 16, 2, 6, C.slate); r(9 - s, 16, 2, 6, C.slate); r(4 + s, 22, 3, 2, C.ink); r(9 - s, 22, 3, 2, C.ink);
    r(2, 10, 2, 5, C.steel);
    if (frame === "whip") { r(12, 6, 2, 4, C.steel); r(14, 2, 1, 5, C.brown); r(15, 0, 1, 3, C.brown); }
    else if (frame === "zap") { r(12, 10, 4, 2, C.steel); r(15, 8, 1, 6, C.yellow); }
    else r(12, 10, 2, 5, C.steel);
  });
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

export function tomb(): Texture {
  return tex("tomb", 12, 14, (r) => { r(2, 0, 8, 12, C.fog); r(1, 2, 10, 10, C.fog); r(3, 3, 6, 1, C.steel); r(5, 4, 2, 5, C.steel); r(4, 5, 4, 1, C.steel); r(0, 12, 12, 2, C.moss); });
}
