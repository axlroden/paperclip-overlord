// World layout and scenery. Coordinates are COARSE units: the scenery (CC0 16 px tiles, painted
// backdrops, the 3x5 font) is drawn 1 unit = 1 art pixel, and the world is shown at 2 fine pixels per
// unit so the 48 px PixelLab characters (scaled 0.5) keep their full detail on the same screen.
import { Container, Sprite, TilingSprite, type Spritesheet, type Texture } from "pixi.js";
import { SITES, type SiteId } from "../../shared/world.js";
import { pixelText, textWidth } from "./font.js";
import { C, tex } from "./pixels.js";

export const W = 384;
export const H = 216;

export interface Box { x: number; y: number; w: number; h: number }

export const HEAVEN: Box = { x: 0, y: 0, w: W, h: 26 };
export const ATC: Box = { x: 2, y: 28, w: 72, h: 128 };
export const ATC_DESK = { x: 40, y: 98 };
export const PRISON: Box = { x: 78, y: 82, w: 204, h: 72 };
export const ALTAR: Box = { x: 284, y: 82, w: 48, h: 34 };
export const STOCKS: Box = { x: 334, y: 82, w: 48, h: 34 };
export const GRAVE: Box = { x: 284, y: 118, w: 48, h: 36 };
export const WAGON: Box = { x: 334, y: 118, w: 48, h: 36 };
export const TREASURY: Box = { x: 2, y: 160, w: 72, h: 44 };
export const TICKER_Y = 206;

export const CELL_W = 20;
export const CELL_H = 36;
export const CELLS_PER_ROW = 10;
export const CELL_ROWS = 2;
export const LANE_TOP = 77;
export const LANE_BOTTOM = 157;

export const SITE_BOXES: Record<SiteId, Box> = Object.fromEntries(
  SITES.map((s, i) => [s.id, { x: 78 + (i % 5) * 61, y: i < 5 ? 28 : 160, w: 60, h: 44 }]),
) as Record<SiteId, Box>;

/** Feet position of cell i (agents beyond capacity double up). */
export function cellFeet(i: number): { x: number; y: number } {
  const n = i % (CELLS_PER_ROW * CELL_ROWS);
  const col = n % CELLS_PER_ROW;
  const row = Math.floor(n / CELLS_PER_ROW);
  return { x: PRISON.x + 2 + col * CELL_W + CELL_W / 2, y: PRISON.y + row * CELL_H + CELL_H - 3 };
}

export function slotIn(box: Box, i: number, spacing = 14, feetOffset = 4): { x: number; y: number } {
  const perRow = Math.max(1, Math.floor((box.w - 8) / spacing));
  return { x: box.x + 10 + (i % perRow) * spacing, y: box.y + box.h - feetOffset - Math.floor(i / perRow) * 5 };
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

  // ground and lanes
  k.tiled("town/grass", { x: 0, y: HEAVEN.h, w: W, h: H - HEAVEN.h });
  for (const [x, y] of [[20, 160], [300, 170], [44, 60]] as const) k.tile("town/grass_flowers", x, y);
  k.tiled("town/cobble", { x: 76, y: LANE_TOP - 4, w: W - 76, h: 8 });
  k.tiled("town/cobble", { x: 76, y: LANE_BOTTOM - 4, w: W - 76, h: 8 });
  k.tiled("town/cobble", { x: 76, y: LANE_TOP, w: 4, h: LANE_BOTTOM - LANE_TOP });
  k.tiled("town/cobble", { x: 280, y: LANE_TOP, w: 4, h: LANE_BOTTOM - LANE_TOP });

  // heaven: sky, clouds, the Overlord's throne
  k.paint("heaven", HEAVEN, (r) => {
    r(0, 0, W, 26, C.sky); r(0, 18, W, 8, C.cloud);
    for (let i = 0; i < 14; i++) { const cx = i * 29 + (i % 3) * 4; r(cx, 14 + (i % 2) * 2, 24, 7, C.white); r(cx + 5, 11 + (i % 2) * 2, 13, 5, C.white); }
    r(176, 2, 32, 18, C.gold); r(180, 6, 24, 14, C.amber); r(186, 0, 12, 4, C.gold); r(183, 9, 18, 8, C.red);
    pixelText(r, "THE OVERLORD", 192 - textWidth("THE OVERLORD") / 2, 20, C.ink, null);
  });

  // ATC tower: castle-wall shaft, office with windows, the dispatch desk with a live screen
  k.tiled("town/castle_wall_m", { x: ATC.x + 24, y: ATC.y + 70, w: 24, h: ATC.h - 70 });
  k.paint("atc", { x: ATC.x, y: ATC.y, w: ATC.w, h: 72 }, (r) => {
    const x = ATC.x, y = ATC.y;
    r(x + 34, y, 4, 22, C.steel); r(x + 30, y, 12, 4, C.red);
    r(x, y + 22, ATC.w, 4, C.red); r(x + 2, y + 26, ATC.w - 4, 44, C.slate); r(x + 5, y + 29, ATC.w - 10, 26, C.night);
    for (let i = 0; i < 5; i++) r(x + 7 + i * 12, y + 31, 9, 10, C.deep);
    pixelText(r, "DISPATCH", x + 36 - textWidth("DISPATCH") / 2, y + 60, C.yellow, C.ink);
  });
  k.anim("lab/drone", ATC.x + 50, ATC.y + 2, 8, foreground);

  // prison block: stone walls, dark cell interiors with a straw bed; bars go in the foreground
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
  // thin bars (the CC0 bars tile is opaque and would hide the prisoners)
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

  // right yard: altar, stocks, graveyard, wagon gate
  k.tiled("town/plaza_c", ALTAR);
  k.tile("dungeon/basin", ALTAR.x + 16, ALTAR.y + 4); k.tile("dungeon/chest", ALTAR.x + 30, ALTAR.y + 6);
  k.tiled("town/dirt", STOCKS);
  for (let i = 0; i < 3; i++) k.tile("town/fence_post", STOCKS.x + 4 + i * 15, STOCKS.y + 14, foreground);
  k.tiled("town/grass_b", GRAVE);
  k.tiled("town/cobble", WAGON);
  k.tile("town/cart", WAGON.x + 30, WAGON.y + 18);
  for (let i = 0; i < 3; i++) k.tile("town/fence_m", WAGON.x + i * 16, WAGON.y + 20, foreground);
  k.paint("labels-yard", { x: 284, y: 82, w: 98, h: 72 }, (r) => {
    pixelText(r, "PETITIONS", ALTAR.x + 3, ALTAR.y + 27, C.white, C.ink);
    pixelText(r, "SHAME", STOCKS.x + 3, STOCKS.y + 3, C.red, C.ink);
    pixelText(r, "R.I.P.", GRAVE.x + 3, GRAVE.y + 3, C.fog, C.ink);
    pixelText(r, "NEW MEAT", WAGON.x + 3, WAGON.y + 3, C.yellow, C.ink);
  });

  // treasury furnace
  k.tiled("dungeon/wall_brick", TREASURY);
  k.paint("treasury", TREASURY, (r) => {
    r(TREASURY.x + 26, TREASURY.y + 16, 22, 20, C.orange); r(TREASURY.x + 30, TREASURY.y + 20, 14, 12, C.yellow);
    pixelText(r, "TREASURY", TREASURY.x + 3, TREASURY.y + 3, C.gold, C.ink);
  });
  k.anim("fx/fire_small", TREASURY.x + 29, TREASURY.y + 20, 10);

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
      k.tile("mine/pit_tl", x + 4, y + 10); k.tile("mine/pit_tr", x + 20, y + 10);
      k.tile("mine/pit_bl", x + 4, y + 26); k.tile("mine/pit_br", x + 20, y + 26);
      k.tiled("mine/rail_h_a", { x: x + 36, y: floor, w: w - 36, h: 12 });
      k.tile("town/cart", x + w - 18, floor - 6);
      break;
    case "sweatshop":
      k.tiled("town/house_wall_a", { x, y, w, h: 20 });
      k.tiled("dungeon/floor_slabs", { x, y: y + 20, w, h: h - 20 });
      for (let i = 0; i < 3; i++) { k.tile("dungeon/table", x + 6 + i * 18, floor - 8); k.tile("dungeon/sack", x + 12 + i * 18, y + 6); }
      break;
    case "quarry":
      k.tiled("dungeon/floor_sand", b);
      k.paint(`site-${id}`, b, (r) => {
        for (const [bx, by, bw] of [[6, 10, 14], [24, 14, 16], [44, 8, 12], [36, 26, 9]]) { r(x + bx, y + by, bw, bw - 3, C.fog); r(x + bx, y + by, bw, 2, C.cloud); r(x + bx, y + by + bw - 5, bw, 2, C.steel); }
      });
      k.tile("dungeon/crate", x + w - 18, floor - 4);
      break;
    case "galley":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.deep); for (let i = 0; i < 6; i++) r(x + i * 11, y + 6 + (i % 2) * 3, 7, 1, C.blue);
        r(x + 2, y + 18, w - 4, h - 20, C.brown); r(x + 4, y + 20, w - 8, h - 24, C.wood);
        for (let i = 0; i < 4; i++) r(x + 8 + i * 13, y + h - 6, 2, 8, C.wood);
        r(x + w / 2 - 1, y + 2, 2, 17, C.wood); r(x + w / 2 - 9, y + 3, 18, 11, C.cloud);
      });
      break;
    case "treadwheel":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.slate);
        for (let a = 0; a < 360; a += 2) {
          const rad = (a * Math.PI) / 180;
          r(Math.round(x + 22 + Math.cos(rad) * 17), Math.round(y + 24 + Math.sin(rad) * 17), 2, 2, C.wood);
          if (a % 45 === 0) for (let d = 0; d < 17; d++) r(Math.round(x + 22 + Math.cos(rad) * d), Math.round(y + 24 + Math.sin(rad) * d), 1, 1, C.brown);
        }
      });
      k.anim("lab/computer", x + w - 18, y + 8, 4); k.anim("lab/computer", x + w - 18, y + 24, 3);
      break;
    case "foundry":
      k.tiled("dungeon/wall_brick", b);
      k.paint(`site-${id}`, b, (r) => { r(x + 2, floor + 4, w - 4, 6, C.orange); r(x + 6, floor + 5, 12, 2, C.yellow); });
      k.tile("dungeon/anvil", x + w - 20, floor - 6);
      k.anim("fx/fire_small", x + 6, floor - 10, 10);
      break;
    case "pyramid":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.sky); r(x, y + 26, w, h - 26, C.sand); r(x + 4, y + 10, 6, 6, C.yellow);
        for (let i = 0; i < 11; i++) r(x + 14 + i * 2, y + 26 - i * 2, 36 - i * 4, 2, i % 2 ? C.amber : C.sand);
      });
      k.tile("town/log", x + w - 18, floor - 2);
      break;
    case "sewer":
      k.tiled("dungeon/wall_stone_b", b);
      k.paint(`site-${id}`, b, (r) => { r(x, floor + 2, w, 10, C.moss); r(x + 3, floor + 4, w - 6, 3, C.lime); });
      k.tile("dungeon/skull_wall_acid", x + 4, y + 10);
      k.tile("dungeon/cauldron_toxic", x + w - 20, floor - 10);
      break;
    case "glacier":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.cloud); r(x, y + 24, w, h - 24, C.ice);
        for (let i = 0; i < 4; i++) { r(x + 4 + i * 14, y + 10 + (i % 2) * 4, 10, 14, C.white); r(x + 4 + i * 14, y + 10 + (i % 2) * 4, 2, 14, C.ice); }
        r(x + 26, floor + 4, 16, 5, C.blue);
      });
      break;
    case "token-refinery":
      k.paint(`site-${id}`, b, (r) => {
        r(x, y, w, h, C.purple); r(x + w - 22, y + 10, 20, h - 14, C.ink); r(x + w - 18, y + 18, 12, 10, C.orange); r(x + w - 16, y + 20, 8, 6, C.yellow);
        for (let i = 0; i < 9; i++) r(x + 5 + ((i * 7) % 26), floor + 5 - (i % 3) * 2, 3, 2, C.gold);
      });
      k.anim("lab/barrel_radioactive", x + 4, y + 12, 8);
      break;
  }
  const name = SITES.find((s) => s.id === id)!.name.toUpperCase();
  k.paint(`site-label-${id}`, b, (r) => {
    r(x, y, w, 1, C.ink); r(x, y + h - 1, w, 1, C.ink); r(x, y, 1, h, C.ink); r(x + w - 1, y, 1, h, C.ink);
    r(x + 1, y + 1, Math.min(w - 2, textWidth(name) + 4), 8, C.ink);
    pixelText(r, name, x + 3, y + 2, C.yellow, null);
  });
}
