// World layout and scenery. Coordinates are COARSE units; the world is shown at 2 fine pixels per unit,
// and everything that has to match the 48 px PixelLab characters (room backdrops, the machine floor,
// the conduits) is drawn at FINE density (backdrops at scale 0.5, fine paint at 2x resolution).
//
// Every room is a station of one machine: its output runs down a conduit into the lanes and along
// them into the Machine God in the middle, which the token refinery workers stoke directly.
//
//   bus ..........................................................  y 0-6
//   [dispatch][ coal mine  ][ sweatshop  ][  quarry   ]            y 6-52
//   ==== conduit + walkway =======================================  y 52-66
//   [ prison 7 x 2 ][   MACHINE GOD   ][ petitions  ]              y 66-138
//   ==== conduit + walkway =======================================  y 138-152
//   [   treadwheel   ][    foundry     ][   toxic sewer   ]        y 152-196
//   bus ..........................................................  y 196-206
//   ticker .......................................................  y 206-216
import { Container, Sprite, type Spritesheet, type Texture } from "pixi.js";
import { SITES, type SiteId } from "../../shared/world.js";
import { pixelText, textWidth } from "./font.js";
import { C, tex } from "./pixels.js";

export const W = 384;
export const H = 216;

export interface Box { x: number; y: number; w: number; h: number }

export const ATC: Box = { x: 2, y: 6, w: 70, h: 46 };
export const ATC_DESK = { x: 30, y: 44 };
export const PRISON: Box = { x: 2, y: 66, w: 144, h: 72 };
export const ALTAR: Box = { x: 286, y: 66, w: 96, h: 72 };
export const TICKER_Y = 206;

export const CELL_W = 20;
export const CELL_H = 36;
export const CELLS_PER_ROW = 7;
export const CELL_ROWS = 2;
export const LANE_TOP = 61;
export const LANE_BOTTOM = 143;

const TOP_SITES: SiteId[] = ["coal-mine", "sweatshop", "quarry"];
const BOTTOM_SITES: SiteId[] = ["treadwheel", "foundry", "sewer"];

export const SITE_BOXES: Record<SiteId, Box> = Object.fromEntries([
  ...TOP_SITES.map((id, i) => [id, { x: 74 + i * 103, y: 6, w: 101, h: 46 }]),
  ["token-refinery", { x: 148, y: 66, w: 136, h: 72 }],
  ...BOTTOM_SITES.map((id, i) => [id, { x: 2 + i * 127, y: 152, w: 125, h: 44 }]),
]) as Record<SiteId, Box>;

/** The Machine God is where the token refinery stokes: every conduit ends here. */
export const GOD: Box = SITE_BOXES["token-refinery"];

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

// ---------------------------------------------------------------- conduits

const PIPE_TOP = 54; // main pipe of the upper lane band
const PIPE_BOTTOM = 150; // main pipe of the lower lane band
const center = (b: Box) => b.x + Math.round(b.w / 2);

/** What each station pumps into the god, as a polyline in coarse units (room outlet -> god inlet). */
export interface Conduit { from: SiteId | "prison" | "altar" | "dispatch"; color: number; points: [number, number][] }

const godX = center(GOD);
const intoGodFromTop = (x: number): [number, number][] => [[x, PIPE_TOP], [godX, PIPE_TOP], [godX, GOD.y]];
const intoGodFromBottom = (x: number): [number, number][] => [[x, PIPE_BOTTOM], [godX, PIPE_BOTTOM], [godX, GOD.y + GOD.h]];
const top = (id: SiteId, color: number): Conduit => ({ from: id, color, points: [[center(SITE_BOXES[id]), 52], ...intoGodFromTop(center(SITE_BOXES[id]))] });
const bottom = (id: SiteId, color: number): Conduit => ({ from: id, color, points: [[center(SITE_BOXES[id]), 152], ...intoGodFromBottom(center(SITE_BOXES[id]))] });

export const CONDUITS: Conduit[] = [
  { from: "dispatch", color: 0x2ce8f5, points: [[center(ATC), ATC.y + ATC.h], ...intoGodFromTop(center(ATC))] },
  top("coal-mine", 0xf77622),
  top("sweatshop", 0xe43b44),
  top("quarry", 0xc0cbdc),
  bottom("treadwheel", 0x2ce8f5),
  bottom("foundry", 0xfeae34),
  bottom("sewer", 0x63c74d),
  // idle prisoners are drained too, and the petitions' prayers feed it
  { from: "prison", color: 0xa22633, points: [[PRISON.x + PRISON.w, GOD.y + 36], [GOD.x, GOD.y + 36]] },
  { from: "altar", color: 0xfee761, points: [[ALTAR.x, GOD.y + 36], [GOD.x + GOD.w, GOD.y + 36]] },
];

// ---------------------------------------------------------------- scenery

type R = (x: number, y: number, w: number, h: number, c: string) => void;

/** Animated props the engine keeps ticking. */
export interface AnimatedProp { sprite: Sprite; frames: Texture[]; fps: number }

export interface Scenery { background: Container; foreground: Container; props: AnimatedProp[] }

/** Ink frame plus a label plate in the top-left corner, the same for every room. */
function frame(r: R, b: Box, label: string) {
  const { x, y, w, h } = b;
  r(x, y, w, 1, C.ink); r(x, y + h - 1, w, 1, C.ink); r(x, y, 1, h, C.ink); r(x + w - 1, y, 1, h, C.ink);
  r(x + 1, y + 1, textWidth(label) + 4, 8, C.ink);
  pixelText(r, label, x + 3, y + 3, C.yellow, null);
}

function pipe(r: R, x: number, y: number, w: number, h: number, horizontal: boolean) {
  r(x, y, w, h, C.steel);
  if (horizontal) { r(x, y, w, 1, C.ink); r(x, y + 1, w, 1, C.cloud); r(x, y + h - 1, w, 1, C.ink); r(x, y + h - 2, w, 1, C.slate); }
  else { r(x, y, 1, h, C.ink); r(x + 1, y, 1, h, C.cloud); r(x + w - 1, y, 1, h, C.ink); r(x + w - 2, y, 1, h, C.slate); }
}

/** Riveted machine plating, walkway gratings and the pipe network, painted at fine density. */
function paintMachine(r: R) {
  const f = 2; // fine px per coarse unit
  r(0, 0, W * f, TICKER_Y * f, C.night);
  for (let y = 0; y < TICKER_Y * f; y += 16) for (let x = (y / 16) % 2 ? 12 : 0; x < W * f; x += 24) {
    r(x, y, 24, 1, C.ink); r(x, y, 1, 16, C.ink); r(x + 1, y + 1, 22, 1, C.slate);
    for (const [rx, ry] of [[3, 3], [20, 3], [3, 12], [20, 12]]) { r(x + rx, y + ry, 1, 1, C.steel); r(x + rx + 1, y + ry + 1, 1, 1, C.ink); }
  }
  for (const lane of [LANE_TOP, LANE_BOTTOM]) {
    const y0 = (lane - 4) * f;
    r(0, y0, W * f, 8 * f, C.slate);
    for (let x = 0; x < W * f; x += 3) r(x, y0 + 1, 1, 8 * f - 2, C.night);
    for (let x = 0; x < W * f; x += 8) { r(x, y0 - 2, 4, 2, C.amber); r(x + 4, y0 - 2, 4, 2, C.ink); r(x, y0 + 8 * f, 4, 2, C.amber); r(x + 4, y0 + 8 * f, 4, 2, C.ink); }
  }
  for (const y of [1, 197]) pipe(r, 0, y * f, W * f, 5 * f, true);
  for (const c of CONDUITS) {
    for (let i = 1; i < c.points.length; i++) {
      const [ax, ay] = c.points[i - 1];
      const [bx, by] = c.points[i];
      const horizontal = ay === by;
      const x = Math.min(ax, bx) * f - (horizontal ? 0 : 3);
      const y = Math.min(ay, by) * f - (horizontal ? 3 : 0);
      pipe(r, x, y, horizontal ? Math.abs(bx - ax) * f : 6, horizontal ? 6 : Math.abs(by - ay) * f, horizontal);
    }
    for (const [px, py] of c.points) { r(px * f - 4, py * f - 4, 8, 8, C.fog); r(px * f - 3, py * f - 3, 6, 6, C.steel); r(px * f - 1, py * f - 1, 2, 2, C.ink); }
  }
}

export function buildScenery(cast: Spritesheet): Scenery {
  const background = new Container();
  const foreground = new Container();
  const coarse = (key: string, b: Box, fn: (r: R) => void) => {
    const s = new Sprite(tex(`scene:${key}`, b.w, b.h, (r) => fn((x, y, w, h, c) => r(x - b.x, y - b.y, w, h, c))));
    s.position.set(b.x, b.y);
    background.addChild(s);
  };
  const backdrop = (name: string, b: Box) => {
    const t = cast.textures[`bg-${name}/0`];
    if (!t) throw new Error(`cast has no backdrop bg-${name}`);
    const s = new Sprite(t);
    s.position.set(b.x, b.y);
    s.width = b.w;
    s.height = b.h;
    background.addChild(s);
  };

  const machine = new Sprite(tex("scene:machine", W * 2, TICKER_Y * 2, paintMachine));
  machine.scale.set(0.5);
  background.addChild(machine);

  backdrop("dispatch", ATC);
  coarse("atc-frame", ATC, (r) => frame(r, ATC, "DISPATCH"));

  for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
    backdrop("prison-cell", { x: PRISON.x + 2 + col * CELL_W, y: PRISON.y + row * CELL_H, w: CELL_W, h: CELL_H });
  }
  const bars = new Sprite(tex("scene:bars", PRISON.w, PRISON.h, (r) => {
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELLS_PER_ROW; col++) {
      const cx = 2 + col * CELL_W;
      const cy = row * CELL_H + 2;
      for (const b of [2, CELL_W - 3]) { r(cx + b, cy, 1, CELL_H - 4, C.fog); r(cx + b, cy, 1, 1, C.white); } // wide gap: prisoners stay visible
      r(cx + 1, cy, CELL_W - 2, 1, C.steel);
    }
  }));
  bars.position.set(PRISON.x, PRISON.y);
  foreground.addChild(bars);

  backdrop("petitions", ALTAR);
  coarse("altar-frame", ALTAR, (r) => frame(r, ALTAR, "PETITIONS"));

  for (const s of SITES) {
    const b = SITE_BOXES[s.id];
    backdrop(s.id === "token-refinery" && cast.textures["bg-machine-god/0"] ? "machine-god" : s.id, b);
    coarse(`site-frame-${s.id}`, b, (r) => frame(r, b, s.name.toUpperCase()));
  }
  coarse("ticker", { x: 0, y: TICKER_Y, w: W, h: H - TICKER_Y }, (r) => r(0, TICKER_Y, W, H - TICKER_Y, C.ink));
  return { background, foreground, props: [] };
}
