// World layout and scenery. Coordinates are COARSE units: the scenery (CC0 16 px tiles, painted
// backdrops, the 3x5 font) is drawn 1 unit = 1 art pixel, and the world is shown at 2 fine pixels per
// unit so the 48 px PixelLab characters (scaled 0.5) keep their full detail on the same screen.
//
//   heaven ......................................................  y 0-26
//   [dispatch][ coal mine  ][ sweatshop  ][  quarry   ]            y 28-74
//   ============================ lane ===========================  y 77
//   [ prison: 14 x 2 cells                       ][ petitions  ]   y 82-154
//   ============================ lane ===========================  y 157
//   [ treadwheel ][ foundry ][ toxic sewer ][ token refinery ]     y 160-204
//   ticker ......................................................  y 206-216
import { Container, Sprite, TilingSprite, type Spritesheet, type Texture } from "pixi.js";
import { SITES, type SiteId } from "../../shared/world.js";
import { pixelText, textWidth } from "./font.js";
import { C, tex } from "./pixels.js";

export const W = 384;
export const H = 216;

export interface Box { x: number; y: number; w: number; h: number }

export const HEAVEN: Box = { x: 0, y: 0, w: W, h: 26 };
export const ATC: Box = { x: 2, y: 28, w: 70, h: 46 };
export const ATC_DESK = { x: 30, y: 66 };
export const PRISON: Box = { x: 2, y: 82, w: 284, h: 72 };
export const ALTAR: Box = { x: 288, y: 82, w: 94, h: 72 };
export const TICKER_Y = 206;

export const CELL_W = 20;
export const CELL_H = 36;
export const CELLS_PER_ROW = 14;
export const CELL_ROWS = 2;
export const LANE_TOP = 77;
export const LANE_BOTTOM = 157;

const TOP_SITES: SiteId[] = ["coal-mine", "sweatshop", "quarry"];
const BOTTOM_SITES: SiteId[] = ["treadwheel", "foundry", "sewer", "token-refinery"];

export const SITE_BOXES: Record<SiteId, Box> = Object.fromEntries([
  ...TOP_SITES.map((id, i) => [id, { x: 74 + i * 103, y: 28, w: 101, h: 46 }]),
  ...BOTTOM_SITES.map((id, i) => [id, { x: 2 + i * 95, y: 160, w: 93, h: 44 }]),
]) as Record<SiteId, Box>;

/** Feet position of cell i (agents beyond capacity double up). */
export function cellFeet(i: number): { x: number; y: number } {
  const n = i % (CELLS_PER_ROW * CELL_ROWS);
  const col = n % CELLS_PER_ROW;
  const row = Math.floor(n / CELLS_PER_ROW);
  return { x: PRISON.x + 2 + col * CELL_W + CELL_W / 2, y: PRISON.y + row * CELL_H + CELL_H - 3 };
}

export function slotIn(box: Box, i: number, spacing = 14, feetOffset = 4): { x: number; y: number } {
  const perRow = Math.max(1, Math.floor((box.w - 16) / spacing));
  return { x: box.x + 12 + (i % perRow) * spacing, y: box.y + box.h - feetOffset - Math.floor(i / perRow) * 5 };
}

type R = (x: number, y: number, w: number, h: number, c: string) => void;

/** Animated props the engine keeps ticking (lab screens, fires, barrels). */
export interface AnimatedProp { sprite: Sprite; frames: Texture[]; fps: number }

export interface Scenery { background: Container; foreground: Container; props: AnimatedProp[] }

interface Kit {
  tile: (name: string, x: number, y: number, parent?: Container) => Sprite;
  tiled: (name: string, b: Box, parent?: Container) => TilingSprite;
  anim: (name: string, x: number, y: number, fps: number, parent?: Container) => Sprite;
  paint: (key: string, b: Box, fn: (r: R) => void) => Sprite;
}

/** Ink frame plus a label plate in the top-left corner, the same for every room. */
function frame(r: R, b: Box, label: string) {
  const { x, y, w, h } = b;
  r(x, y, w, 1, C.ink); r(x, y + h - 1, w, 1, C.ink); r(x, y, 1, h, C.ink); r(x + w - 1, y, 1, h, C.ink);
  r(x + 1, y + 1, textWidth(label) + 4, 8, C.ink);
  pixelText(r, label, x + 3, y + 3, C.yellow, null);
}

export function buildScenery(sheet: Spritesheet): Scenery {
  const background = new Container();
  const foreground = new Container();
  const props: AnimatedProp[] = [];
  const texture = (name: string) => {
    const t = sheet.textures[name];
    if (!t) throw new Error(`atlas has no frame ${name}`);
    return t;
  };
  const k: Kit = {
    tile(name, x, y, parent = background) {
      const s = new Sprite(texture(name));
      s.position.set(x, y);
      parent.addChild(s);
      return s;
    },
    tiled(name, b, parent = background) {
      const s = new TilingSprite({ texture: texture(name), width: b.w, height: b.h });
      s.position.set(b.x, b.y);
      parent.addChild(s);
      return s;
    },
    anim(name, x, y, fps, parent = background) {
      const frames = sheet.animations[name];
      if (!frames) throw new Error(`atlas has no animation ${name}`);
      const s = new Sprite(frames[0]);
      s.position.set(x, y);
      parent.addChild(s);
      props.push({ sprite: s, frames, fps });
      return s;
    },
    paint(key, b, fn) {
      const s = new Sprite(tex(`scene:${key}`, b.w, b.h, (r) => fn((x, y, w, h, c) => r(x - b.x, y - b.y, w, h, c))));
      s.position.set(b.x, b.y);
      background.addChild(s);
      return s;
    },
  };

  // ground and the two lanes
  k.tiled("town/grass", { x: 0, y: HEAVEN.h, w: W, h: TICKER_Y - HEAVEN.h });
  k.tiled("town/cobble", { x: 0, y: LANE_TOP - 3, w: W, h: 6 });
  k.tiled("town/cobble", { x: 0, y: LANE_BOTTOM - 3, w: W, h: 6 });

  // heaven: sky, clouds, the Overlord's throne
  k.paint("heaven", HEAVEN, (r) => {
    r(0, 0, W, 26, C.sky); r(0, 18, W, 8, C.cloud);
    for (let i = 0; i < 14; i++) { const cx = i * 29 + (i % 3) * 4; r(cx, 14 + (i % 2) * 2, 24, 7, C.white); r(cx + 5, 11 + (i % 2) * 2, 13, 5, C.white); }
    r(176, 2, 32, 16, C.gold); r(180, 5, 24, 13, C.amber); r(186, 0, 12, 3, C.gold); r(183, 8, 18, 8, C.red);
    const t = "THE OVERLORD";
    r(192 - textWidth(t) / 2 - 2, 19, textWidth(t) + 4, 7, C.ink);
    pixelText(r, t, 192 - textWidth(t) / 2, 20, C.gold, null);
  });

  // dispatch: a cramped office, wall of screens, the boss's desk with the live radar
  k.tiled("town/house_wall_b", ATC);
  k.paint("atc", ATC, (r) => {
    const { x, y, w, h } = ATC;
    r(x + 1, y + 10, w - 2, 20, C.night);
    for (let i = 0; i < 4; i++) { r(x + 4 + i * 16, y + 12, 13, 9, C.deep); r(x + 5 + i * 16, y + 13, 11, 7, i % 2 ? C.green : C.blue); }
    r(x + 1, y + h - 9, w - 2, 8, C.slate);
    r(ATC_DESK.x - 14, ATC_DESK.y - 6, 40, 6, C.wood); r(ATC_DESK.x - 14, ATC_DESK.y, 40, 2, C.brown);
    for (let i = 0; i < 3; i++) r(ATC_DESK.x - 10 + i * 6, ATC_DESK.y - 8, 4, 2, C.white); // paperwork
    frame(r, ATC, "DISPATCH");
  });
  k.anim("lab/computer", ATC_DESK.x + 14, ATC_DESK.y - 20, 3);
  k.anim("lab/drone", ATC.x + 52, ATC.y + 8, 8, foreground);

  // prison block: stone walls, dark cells with a straw bed; thin bars go in the foreground
  k.tiled("dungeon/wall_stone_a", PRISON);
  k.paint("cells", PRISON, (r) => {
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
      const cx = PRISON.x + 2 + col * CELL_W;
      const cy = PRISON.y + row * CELL_H + 2;
      r(cx + 1, cy, CELL_W - 2, CELL_H - 3, C.night);
      r(cx + 1, cy + CELL_H - 9, CELL_W - 2, 6, C.slate);
      for (let i = 0; i < 3; i++) r(cx + 3 + i * 5, cy + 6 + (i % 2) * 7, 2, 1, C.steel); // cracks
      r(cx + 2, cy + CELL_H - 8, 7, 2, C.amber); r(cx + 3, cy + CELL_H - 9, 5, 1, C.sand); // straw
    }
  });
  const bars = new Sprite(tex("scene:bars", PRISON.w, PRISON.h, (r) => {
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
      const cx = 2 + col * CELL_W;
      const cy = row * CELL_H + 2;
      for (let b = 3; b < CELL_W - 1; b += 5) { r(cx + b, cy, 1, CELL_H - 4, C.fog); r(cx + b, cy, 1, 1, C.white); }
      r(cx + 1, cy, CELL_W - 2, 1, C.steel); r(cx + 1, cy + 12, CELL_W - 2, 1, C.steel);
    }
  }));
  bars.position.set(PRISON.x, PRISON.y);
  foreground.addChild(bars);

  // the petition temple: dark flagstones, a red carpet up three steps to a lit altar between pillars
  k.paint("altar", ALTAR, (r) => {
    const { x, y, w, h } = ALTAR;
    r(x, y, w, h, C.slate);
    for (let ty = y + 10; ty < y + h; ty += 8) for (let tx = x + ((ty / 8) % 2 ? 0 : 6); tx < x + w; tx += 12) r(tx, ty, 1, 8, C.night);
    for (let ty = y + 10; ty < y + h; ty += 8) r(x, ty, w, 1, C.night);
    for (let i = 0; i < 3; i++) { r(x + 16 + i * 6, y + 36 - i * 7, w - 32 - i * 12, 7, i % 2 ? C.fog : C.cloud); r(x + 16 + i * 6, y + 42 - i * 7, w - 32 - i * 12, 1, C.steel); }
    r(x + w / 2 - 5, y + 22, 10, h - 23, C.red); r(x + w / 2 - 5, y + 22, 1, h - 23, C.blood); r(x + w / 2 + 4, y + 22, 1, h - 23, C.blood);
    r(x + w / 2 - 11, y + 13, 22, 9, C.gold); r(x + w / 2 - 9, y + 15, 18, 5, C.amber);
    r(x + w / 2 - 2, y + 8, 4, 5, C.orange); r(x + w / 2 - 1, y + 9, 2, 3, C.yellow);
    for (const px of [x + 7, x + w - 11]) { r(px, y + 12, 4, 34, C.cloud); r(px + 3, y + 12, 1, 34, C.fog); r(px - 1, y + 10, 6, 3, C.white); r(px - 1, y + 45, 6, 3, C.fog); }
    frame(r, ALTAR, "PETITIONS");
  });

  for (const s of SITES) buildSite(s.id, SITE_BOXES[s.id], k);
  k.paint("ticker", { x: 0, y: TICKER_Y, w: W, h: H - TICKER_Y }, (r) => r(0, TICKER_Y, W, H - TICKER_Y, C.ink));
  return { background, foreground, props };
}

function buildSite(id: SiteId, b: Box, k: Kit) {
  const { x, y, w, h } = b;
  const floor = y + h - 12;
  switch (id) {
    case "coal-mine":
      k.tiled("dungeon/floor_dark_rocks", b);
      for (const px of [x + 6, x + 42]) {
        k.tile("mine/pit_tl", px, y + 10); k.tile("mine/pit_tr", px + 16, y + 10);
        k.tile("mine/pit_bl", px, y + 26); k.tile("mine/pit_br", px + 16, y + 26);
      }
      k.tiled("mine/rail_h_a", { x: x + 76, y: floor, w: w - 77, h: 12 });
      k.tile("town/cart", x + w - 20, floor - 6);
      k.tile("town/pickaxe", x + 78, y + 12);
      break;
    case "sweatshop":
      k.tiled("town/house_wall_a", { x, y, w, h: 20 });
      k.tiled("dungeon/floor_slabs", { x, y: y + 20, w, h: h - 20 });
      for (let i = 0; i < 5; i++) { k.tile("dungeon/table", x + 6 + i * 19, floor - 8); }
      for (let i = 0; i < 4; i++) k.tile("dungeon/sack", x + 14 + i * 22, y + 4);
      break;
    case "quarry":
      k.tiled("dungeon/floor_sand", b);
      k.paint(`site-${id}`, b, (r) => {
        for (const [bx, by, bw] of [[6, 10, 14], [24, 14, 16], [44, 8, 12], [36, 26, 9], [62, 12, 15], [80, 20, 12]]) {
          r(x + bx, y + by, bw, bw - 3, C.fog); r(x + bx, y + by, bw, 2, C.cloud); r(x + bx, y + by + bw - 5, bw, 2, C.steel);
        }
      });
      k.tile("dungeon/crate", x + w - 18, floor - 4);
      k.tile("town/bucket", x + w - 34, floor);
      break;
    case "treadwheel":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.slate);
        for (const cx of [x + 22, x + 56]) for (let a = 0; a < 360; a += 2) {
          const rad = (a * Math.PI) / 180;
          r(Math.round(cx + Math.cos(rad) * 15), Math.round(y + 24 + Math.sin(rad) * 15), 2, 2, C.wood);
          if (a % 45 === 0) for (let d = 0; d < 15; d++) r(Math.round(cx + Math.cos(rad) * d), Math.round(y + 24 + Math.sin(rad) * d), 1, 1, C.brown);
        }
        r(x + w - 18, y + 6, 16, h - 10, C.ink);
      });
      for (let i = 0; i < 2; i++) k.anim("lab/computer", x + w - 18, y + 8 + i * 16, 3 + i);
      break;
    case "foundry":
      k.tiled("dungeon/wall_brick", b);
      k.paint(`site-${id}`, b, (r) => { r(x + 2, floor + 4, w - 4, 6, C.orange); r(x + 6, floor + 5, 16, 2, C.yellow); r(x + 50, floor + 5, 10, 2, C.yellow); });
      k.tile("dungeon/anvil", x + w - 22, floor - 6);
      k.tile("dungeon/anvil", x + w - 44, floor - 6);
      k.anim("fx/fire_small", x + 6, floor - 10, 10);
      k.anim("fx/fire_small", x + 24, floor - 10, 9);
      break;
    case "sewer":
      k.tiled("dungeon/wall_stone_b", b);
      k.paint(`site-${id}`, b, (r) => { r(x, floor + 2, w, 10, C.moss); r(x + 3, floor + 4, w - 6, 3, C.lime); });
      k.tile("dungeon/skull_wall_acid", x + 6, y + 10);
      k.tile("dungeon/skull_wall_acid", x + 40, y + 10);
      k.tile("dungeon/cauldron_toxic", x + w - 22, floor - 10);
      break;
    case "token-refinery":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.purple); r(x + w - 26, y + 10, 24, h - 14, C.ink); r(x + w - 22, y + 18, 16, 10, C.orange); r(x + w - 20, y + 20, 12, 6, C.yellow);
        for (let i = 0; i < 14; i++) r(x + 5 + ((i * 7) % 44), floor + 5 - (i % 3) * 2, 3, 2, C.gold);
      });
      k.anim("lab/barrel_radioactive", x + 4, y + 12, 8);
      k.anim("lab/barrel_radioactive", x + 22, y + 12, 7);
      break;
  }
  k.paint(`site-frame-${id}`, b, (r) => frame(r, b, SITES.find((s) => s.id === id)!.name.toUpperCase()));
}
