// Static world layout (logical 480x270 pixels) and the painters for the background and foreground.
import { SITES, type SiteId } from "../../shared/world.js";
import { pixelText, textWidth } from "./font.js";
import { C, tex } from "./pixels.js";

export const W = 480;
export const H = 270;

export interface Box { x: number; y: number; w: number; h: number }

export const HEAVEN: Box = { x: 0, y: 0, w: W, h: 34 };
export const ATC: Box = { x: 4, y: 38, w: 86, h: 146 };
export const ATC_DESK = { x: 46, y: 100 };
export const PRISON: Box = { x: 98, y: 92, w: 244, h: 92 };
export const ALTAR: Box = { x: 346, y: 92, w: 52, h: 40 };
export const STOCKS: Box = { x: 402, y: 92, w: 74, h: 40 };
export const GRAVE: Box = { x: 346, y: 136, w: 64, h: 48 };
export const WAGON: Box = { x: 414, y: 136, w: 62, h: 48 };
export const TREASURY: Box = { x: 4, y: 188, w: 86, h: 48 };
export const TICKER_Y = 240;

export const CELL_W = 22;
export const CELL_H = 30;
export const CELLS_PER_ROW = 11;
export const CELL_ROWS = 3;
export const LANE_TOP = 89;
export const LANE_BOTTOM = 186;

export const SITE_BOXES: Record<SiteId, Box> = Object.fromEntries(
  SITES.map((s, i) => [s.id, { x: 96 + (i % 5) * 77, y: i < 5 ? 38 : 189, w: 74, h: 48 }]),
) as Record<SiteId, Box>;

/** Feet position of cell i (agents beyond capacity double up in the last cells). */
export function cellFeet(i: number): { x: number; y: number } {
  const n = i % (CELLS_PER_ROW * CELL_ROWS);
  const col = n % CELLS_PER_ROW;
  const row = Math.floor(n / CELLS_PER_ROW);
  return { x: PRISON.x + 1 + col * CELL_W + CELL_W / 2, y: PRISON.y + row * CELL_H + CELL_H - 3 };
}

export function slotIn(box: Box, i: number, spacing = 12, feetOffset = 4): { x: number; y: number } {
  const perRow = Math.max(1, Math.floor((box.w - 8) / spacing));
  return { x: box.x + 8 + (i % perRow) * spacing, y: box.y + box.h - feetOffset - Math.floor(i / perRow) * 6 };
}

type R = (x: number, y: number, w: number, h: number, c: string) => void;

function brick(r: R, b: Box, base: string, mortar: string) {
  r(b.x, b.y, b.w, b.h, base);
  for (let y = b.y; y < b.y + b.h; y += 4) {
    r(b.x, y, b.w, 1, mortar);
    for (let x = b.x + ((y / 4) % 2 ? 0 : 4); x < b.x + b.w; x += 8) r(x, y, 1, 4, mortar);
  }
}

// y is the text baseline, matching the old fillText calls.
function label(r: R, text: string, x: number, y: number, color: string = C.white) {
  pixelText(r, text, x, y - 5, color, C.ink);
}

function paintSite(r: R, id: SiteId, b: Box) {
  const { x, y, w, h } = b;
  const floor = y + h - 10;
  switch (id) {
    case "coal-mine":
      r(x, y, w, h, C.dark); r(x + 4, y + 6, w - 8, h - 14, C.ink);
      for (let i = 0; i < 9; i++) r(x + 6 + ((i * 17) % (w - 12)), y + 8 + ((i * 11) % 20), 3, 2, C.soot);
      r(x + 2, y + 4, 2, h - 8, C.wood); r(x + w - 4, y + 4, 2, h - 8, C.wood); r(x + 2, y + 4, w - 4, 2, C.wood);
      r(x + w - 18, floor + 2, 14, 6, C.steel); r(x + w - 17, floor, 12, 3, C.soot); r(x, floor + 8, w, 2, C.brown);
      break;
    case "sweatshop":
      brick(r, b, C.rust, C.brown); r(x + 3, y + 4, w - 6, h - 8, C.stone);
      for (let i = 0; i < 4; i++) { r(x + 6 + i * 17, floor - 4, 12, 3, C.wood); r(x + 10 + i * 17, floor - 8, 4, 4, C.slate); }
      r(x + 6, y + 6, 20, 6, C.amber); label(r, "QUOTA", x + 7, y + 11, C.ink);
      break;
    case "quarry":
      r(x, y, w, h, C.stone); r(x, y, w, 10, C.sand);
      for (const [bx, by, bw] of [[6, 16, 14], [26, 22, 18], [50, 14, 16], [40, 30, 10]]) { r(x + bx, y + by, bw, bw - 4, C.fog); r(x + bx, y + by, bw, 2, C.cloud); }
      break;
    case "galley":
      r(x, y, w, h, C.deep); for (let i = 0; i < 6; i++) r(x + i * 13, y + 6 + (i % 2) * 3, 8, 1, C.blue);
      r(x + 2, y + 18, w - 4, h - 22, C.brown); r(x + 4, y + 20, w - 8, h - 26, C.wood);
      r(x + w / 2 - 1, y + 2, 2, 18, C.wood); r(x + w / 2 - 10, y + 4, 20, 12, C.cloud);
      break;
    case "treadwheel":
      r(x, y, w, h, C.slate); r(x + w - 22, y + 4, 18, h - 8, C.ink);
      for (let i = 0; i < 6; i++) r(x + w - 20, y + 6 + i * 6, 14, 4, C.night);
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        r(Math.round(x + 26 + Math.cos(rad) * 19), Math.round(y + 24 + Math.sin(rad) * 19), 2, 2, C.wood);
        if (a % 45 === 0) for (let d = 0; d < 19; d += 1) r(Math.round(x + 26 + Math.cos(rad) * d), Math.round(y + 24 + Math.sin(rad) * d), 1, 1, C.brown);
      }
      break;
    case "foundry":
      brick(r, b, C.dark, C.ink); r(x + 4, floor - 2, w - 8, 6, C.orange); r(x + 8, floor - 1, 10, 2, C.yellow);
      r(x + w - 20, y + 4, 14, 24, C.steel); r(x + w - 18, y + 6, 10, 6, C.orange);
      break;
    case "pyramid":
      r(x, y, w, h, C.sky); r(x, y + 30, w, h - 30, C.sand);
      for (let i = 0; i < 12; i++) r(x + 20 + i * 2, y + 30 - i * 2, 40 - i * 4, 2, i % 2 ? C.amber : C.sand);
      r(x + 6, y + 6, 6, 6, C.yellow);
      break;
    case "sewer":
      brick(r, b, C.teal, C.ink); r(x, floor - 2, w, 8, C.moss); r(x + 4, floor - 1, w - 8, 3, C.lime);
      r(x + 4, y + 6, 12, 10, C.steel); r(x + 6, y + 8, 8, 6, C.ink); r(x + 8, y + 14, 4, 10, C.lime);
      break;
    case "glacier":
      r(x, y, w, h, C.cloud); r(x, y + 26, w, h - 26, C.ice);
      for (let i = 0; i < 5; i++) r(x + 4 + i * 14, y + 6 + (i % 2) * 6, 10, 18, C.white);
      r(x + 30, floor - 2, 18, 6, C.blue);
      break;
    case "token-refinery":
      r(x, y, w, h, C.purple); r(x + w - 26, y + 6, 22, h - 12, C.ink); r(x + w - 22, y + 18, 14, 10, C.orange); r(x + w - 20, y + 20, 10, 6, C.yellow);
      for (let i = 0; i < 10; i++) r(x + 6 + ((i * 7) % 30), floor + 2 - (i % 3) * 2, 3, 2, C.gold);
      break;
  }
  r(x, y, w, 1, C.ink); r(x, y + h - 1, w, 1, C.ink); r(x, y, 1, h, C.ink); r(x + w - 1, y, 1, h, C.ink);
  const name = SITES.find((s) => s.id === id)!.name;
  r(x + 1, y + 1, Math.min(w - 2, textWidth(name) + 4), 8, C.ink);
  pixelText(r, name, x + 3, y + 2, C.yellow, null);
}

export function background() {
  return tex("bg", W, H, (r) => {
    // ground + lanes
    r(0, 0, W, H, C.moss);
    for (let i = 0; i < 400; i++) r((i * 97) % W, (i * 53) % H, 1, 1, C.green);
    r(92, LANE_TOP - 2, W - 92, 4, C.stone); r(92, LANE_BOTTOM - 2, W - 92, 4, C.stone);
    r(92, LANE_TOP, 4, LANE_BOTTOM - LANE_TOP, C.stone); r(342, LANE_TOP, 4, LANE_BOTTOM - LANE_TOP, C.stone);
    // heaven
    r(0, 0, W, HEAVEN.h, C.sky); r(0, 24, W, 10, C.cloud);
    for (let i = 0; i < 14; i++) { const cx = i * 36 + (i % 3) * 5; r(cx, 18 + (i % 2) * 3, 30, 8, C.white); r(cx + 6, 14 + (i % 2) * 3, 16, 6, C.white); }
    r(222, 4, 36, 24, C.gold); r(226, 8, 28, 20, C.amber); r(234, 0, 12, 6, C.gold); r(230, 12, 20, 10, C.red);
    label(r, "THE OVERLORD", 214, 32, C.ink);
    // ATC tower
    r(ATC.x + 30, ATC.y + 70, 26, ATC.h - 70, C.fog); brick(r, { x: ATC.x + 30, y: ATC.y + 70, w: 26, h: ATC.h - 70 }, C.fog, C.steel);
    r(ATC.x + 2, ATC.y + 30, ATC.w - 4, 42, C.slate); r(ATC.x + 6, ATC.y + 34, ATC.w - 12, 24, C.night);
    r(ATC.x, ATC.y + 26, ATC.w, 4, C.red); r(ATC.x + 40, ATC.y + 4, 4, 22, C.steel); r(ATC.x + 36, ATC.y, 12, 5, C.red);
    r(ATC.x + 8, ATC.y + 48, 20, 10, C.ink); r(ATC.x + 10, ATC.y + 50, 16, 6, C.green); // radar
    r(ATC_DESK.x - 14, ATC_DESK.y - 2, 34, 6, C.wood); r(ATC_DESK.x + 10, ATC_DESK.y - 6, 4, 4, C.red); r(ATC_DESK.x - 12, ATC_DESK.y - 6, 4, 4, C.amber);
    label(r, "DISPATCH", ATC.x + 26, ATC.y + 80, C.yellow);
    // prison block
    brick(r, PRISON, C.steel, C.slate);
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
      const cx = PRISON.x + 1 + col * CELL_W;
      const cy = PRISON.y + row * CELL_H;
      r(cx + 1, cy + 2, CELL_W - 2, CELL_H - 3, C.night); r(cx + 1, cy + CELL_H - 5, CELL_W - 2, 4, C.slate);
      r(cx + 3, cy + CELL_H - 6, 6, 2, C.sand); // straw bed
    }
    // altar
    r(ALTAR.x, ALTAR.y, ALTAR.w, ALTAR.h, C.stone); r(ALTAR.x + 16, ALTAR.y + 6, 20, 16, C.cloud); r(ALTAR.x + 20, ALTAR.y + 2, 12, 6, C.gold);
    label(r, "PETITIONS", ALTAR.x + 4, ALTAR.y + 37, C.ink);
    // stocks
    r(STOCKS.x, STOCKS.y, STOCKS.w, STOCKS.h, C.sand);
    for (let i = 0; i < 4; i++) { r(STOCKS.x + 6 + i * 17, STOCKS.y + 8, 2, 30, C.brown); }
    label(r, "SHAME", STOCKS.x + 4, STOCKS.y + 6, C.blood);
    // graveyard + wagon gate
    r(GRAVE.x, GRAVE.y, GRAVE.w, GRAVE.h, C.teal); label(r, "R.I.P.", GRAVE.x + 4, GRAVE.y + 7, C.fog);
    r(WAGON.x, WAGON.y, WAGON.w, WAGON.h, C.stone); r(WAGON.x + 4, WAGON.y + 12, WAGON.w - 8, 26, C.brown);
    for (let i = 0; i < 7; i++) r(WAGON.x + 6 + i * 8, WAGON.y + 12, 1, 26, C.ink);
    r(WAGON.x + 6, WAGON.y + 38, 8, 8, C.ink); r(WAGON.x + WAGON.w - 14, WAGON.y + 38, 8, 8, C.ink);
    label(r, "NEW MEAT", WAGON.x + 4, WAGON.y + 7, C.ink);
    // treasury furnace
    brick(r, TREASURY, C.dark, C.ink); r(TREASURY.x + 30, TREASURY.y + 18, 26, 20, C.orange); r(TREASURY.x + 34, TREASURY.y + 22, 18, 12, C.yellow);
    label(r, "TREASURY", TREASURY.x + 4, TREASURY.y + 8, C.gold);
    for (const s of SITES) paintSite(r, s.id, SITE_BOXES[s.id]);
    r(0, TICKER_Y, W, H - TICKER_Y, C.ink);
  });
}

/** Cell bars drawn above the actors so prisoners are really behind bars. */
export function cellBars() {
  return tex("bars", PRISON.w + 4, PRISON.h, (r) => {
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
      const cx = 1 + col * CELL_W;
      const cy = row * CELL_H;
      for (let b = 3; b < CELL_W - 1; b += 4) r(cx + b, cy + 2, 1, CELL_H - 4, C.fog);
      r(cx + 1, cy + 2, CELL_W - 2, 1, C.fog); r(cx + 1, cy + CELL_H / 2, CELL_W - 2, 1, C.steel);
    }
  });
}
