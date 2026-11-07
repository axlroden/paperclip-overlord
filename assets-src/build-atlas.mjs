// Packs the frames we use from the vendored CC0 packs into assets/atlas.png + a Pixi v8 spritesheet
// assets/atlas.json (with `animations`), copies the fonts to assets/fonts/, and writes a labelled
// contact sheet to assets-src/build/contact-sheet.png for review.
// Run: npm --prefix assets-src run atlas
// Vendor files are untrusted data: they are only ever decoded as images here, never executed.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, 'vendor');
const OUT = join(HERE, '..', 'assets');
const BUILD = join(HERE, 'build');
const ATLAS_WIDTH = 512;
const PAD = 1; // each frame is extruded by 1 px (edge copy) so nearest sampling never bleeds a neighbour

const NINJA = 'ninja-adventure/Ninja Adventure - Asset Pack';
const DUNGEON = 'kenney-tiny-dungeon/Tilemap/tilemap_packed.png'; // 12 x 11 tiles of 16 px, no spacing
const TOWN = 'kenney-tiny-town/Tilemap/tilemap_packed.png'; // 12 x 11 tiles of 16 px, no spacing
const HOLE = `${NINJA}/Backgrounds/Tilesets/TilesetHole.png`; // 11 x 5 tiles of 16 px
const LAB = 'robot-lab/exports/robot-lab_v1.0';

const frames = []; // { name, src, x, y, w, h }
const animations = {};

const add = (name, src, x, y, w, h) => frames.push({ name, src, x, y, w, h });
/** Named 16 px tiles from a packed tilemap: { name: index }. */
const tiles = (prefix, src, cols, map) => {
  for (const [name, i] of Object.entries(map)) add(`${prefix}/${name}`, src, (i % cols) * 16, Math.floor(i / cols) * 16, 16, 16);
};
/** An animation laid out left to right, then top to bottom, in a grid of w x h cells. */
const anim = (name, src, w, h, count, { cols = count, start = 0 } = {}) => {
  animations[name] = [];
  for (let i = 0; i < count; i++) {
    const c = start + i;
    add(`${name}_${i}`, src, (c % cols) * w, Math.floor(c / cols) * h, w, h);
    animations[name].push(`${name}_${i}`);
  }
};
/** Ninja Adventure character: SeparateAnim sheets are one column per direction (down, up, left, right). */
const DIRS = ['down', 'up', 'left', 'right'];
const ninjaChar = (name, folder) => {
  const dir = `${NINJA}/Actor/Character/${folder}/SeparateAnim`;
  DIRS.forEach((d, c) => {
    animations[`${name}/walk_${d}`] = [];
    for (let r = 0; r < 4; r++) {
      add(`${name}/walk_${d}_${r}`, `${dir}/Walk.png`, c * 16, r * 16, 16, 16);
      animations[`${name}/walk_${d}`].push(`${name}/walk_${d}_${r}`);
    }
    add(`${name}/idle_${d}`, `${dir}/Idle.png`, c * 16, 0, 16, 16);
    add(`${name}/attack_${d}`, `${dir}/Attack.png`, c * 16, 0, 16, 16);
  });
  add(`${name}/dead`, `${dir}/Dead.png`, 0, 0, 16, 16);
};

// ---- Prison block, cells, walls, floors (Kenney Tiny Dungeon) ----
tiles('dungeon', DUNGEON, 12, {
  floor_dark: 0, floor_dark_rocks: 12, floor_dark_pebbles: 24, floor_sand: 48, floor_sand_b: 49, floor_slabs: 42,
  wall_frame_tl: 1, wall_frame_t: 2, wall_frame_tr: 3, wall_frame_l: 13, wall_frame_c: 14, wall_frame_r: 15,
  wall_frame_bl: 25, wall_frame_b: 26, wall_frame_br: 27,
  wall_brick: 40, wall_stone_a: 57, wall_stone_b: 58, wall_stone_c: 59, wall_vent: 28, wall_banner: 29, wall_grate: 41,
  door_closed: 45, door_open: 33, door_arch: 21,
  bars_l: 76, bars_m: 77, bars_r: 78,
  pillar: 18, skull_wall: 19, skull_wall_acid: 20, basin: 31, cauldron_toxic: 32,
  tomb_cross: 64, tomb_round: 65, anvil: 74, table: 72, stool: 73, crate: 63, shelf: 75, sack: 66,
  chest: 89, chest_open: 91, barrel: 82,
  ghost: 121, bat: 120, spider: 122, rat: 123, hammer: 117, axe: 119,
});
// ---- Coal mine (rails from Tiny Dungeon, pit from Ninja Adventure) ----
tiles('mine', DUNGEON, 12, {
  rail_v_a: 67, rail_v_b: 68, rail_h_a: 79, rail_h_b: 80, rail_tl: 69, rail_tr: 71, rail_bl: 93, rail_br: 95,
});
tiles('mine', HOLE, 11, { pit_tl: 0, pit_t: 1, pit_tr: 2, pit_l: 11, pit_c: 12, pit_r: 13, pit_bl: 22, pit_b: 23, pit_br: 24 });
// ---- Town props, yard, stocks fence, gate (Kenney Tiny Town) ----
tiles('town', TOWN, 12, {
  grass: 0, grass_b: 1, grass_flowers: 2, dirt: 40, dirt_b: 39, cobble: 43,
  plaza_tl: 96, plaza_t: 97, plaza_tr: 98, plaza_l: 108, plaza_c: 109, plaza_r: 110, plaza_bl: 120, plaza_b: 121, plaza_br: 122,
  castle_wall_l: 99, castle_wall_m: 100, castle_wall_r: 101, wall_brick: 126, wall_door: 125,
  gate_l: 111, gate_r: 112, arch_l: 113, arch_r: 114,
  house_wall_a: 76, house_wall_b: 77, house_door_arch: 78, house_wall_c: 79, house_window: 88, house_door: 89,
  fence_l: 44, fence_m: 45, fence_r: 46, fence_post: 47, rail_l: 80, rail_m: 81, rail_r: 82, sign: 83,
  cart: 57, pickaxe: 115, pitchfork: 116, key: 117, hammer: 128, sickle: 129, axe: 127,
  bucket: 130, bucket_water: 131, well: 104, bomb: 105, log: 106, pot: 107, hay: 93, target: 95,
});
// ---- Lab props for the ATC office and refinery (Robot Lab) ----
anim('lab/computer', `${LAB}/computer.png`, 16, 16, 2);
anim('lab/drone', `${LAB}/drone.png`, 16, 16, 4);
anim('lab/barrel_radioactive', `${LAB}/radioactive_barrel.png`, 16, 16, 8);
add('lab/table', `${LAB}/table.png`, 0, 0, 16, 16);
for (let i = 0; i < 5; i++) add(`lab/robot_part_${i}`, `${LAB}/spare_robot_parts.png`, i * 16, 0, 16, 16);
// ---- Item sprites (Ninja Adventure) ----
add('item/whip', `${NINJA}/Items/Weapons/Whip/Sprite.png`, 0, 0, 9, 13);
add('item/pickaxe', `${NINJA}/Items/Weapons/Pickaxe/Sprite.png`, 0, 0, 11, 13);
// ---- FX (Ninja Adventure + Aim Studios) ----
anim('fx/explosion', `${NINJA}/FX/Elemental/Explosion/SpriteSheet.png`, 40, 40, 9);
anim('fx/flame', `${NINJA}/FX/Elemental/Flam/SpriteSheet.png`, 25, 30, 8);
anim('fx/lightning', `${NINJA}/FX/Elemental/Thunder/SpriteSheet.png`, 20, 28, 8);
anim('fx/ice', `${NINJA}/FX/Elemental/Ice/SpriteSheet.png`, 32, 32, 10);
anim('fx/ice_shards', `${NINJA}/FX/Elemental/Ice/SpriteSheetB.png`, 32, 32, 9);
anim('fx/smoke', `${NINJA}/FX/Smoke/Smoke/SpriteSheet.png`, 32, 32, 6);
anim('fx/fire_small', `${NINJA}/FX/Particle/Fire.png`, 12, 12, 8);
anim('fx/soul', `${NINJA}/FX/Magic/Spirit/SpriteSheet.png`, 32, 32, 5);
anim('fx/sparkle', `${NINJA}/FX/Magic/Circle/SpriteSheetSpark.png`, 32, 32, 6);
anim('fx/fireball', `${NINJA}/FX/Projectile/Fireball.png`, 16, 16, 4);
anim('fx/blast', 'aim-explosions/Blast.png', 32, 32, 9, { cols: 3 });
anim('fx/burst', 'aim-explosions/explosion (1).png', 32, 32, 8, { cols: 3, start: 1 }); // cell 0 is empty
anim('fx/explosion_big', 'aim-explosions/realistic explosion.png', 64, 64, 8, { cols: 4 });
// ---- Placeholder characters, 16 px (Ninja Adventure) until the generated 32 px set lands ----
ninjaChar('char/worker', 'Boy');
ninjaChar('char/robot', 'RobotGrey');
ninjaChar('char/skeleton', 'Skeleton');
ninjaChar('char/atc', 'Inspector');

// ---------------------------------------------------------------------------------------------
const sources = new Map(); // src -> { data, info } raw RGBA, decoded once
async function source(src) {
  if (!sources.has(src)) sources.set(src, await sharp(join(VENDOR, src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  return sources.get(src);
}

// Cut every frame, checking it is inside its source and not fully transparent.
const names = new Set();
for (const f of frames) {
  if (names.has(f.name)) throw new Error(`duplicate frame name ${f.name}`);
  names.add(f.name);
  const { info, data } = await source(f.src);
  if (f.x < 0 || f.y < 0 || f.x + f.w > info.width || f.y + f.h > info.height) {
    throw new Error(`${f.name}: ${f.x},${f.y} ${f.w}x${f.h} is outside ${f.src} (${info.width}x${info.height})`);
  }
  let alpha = 0;
  for (let y = f.y; y < f.y + f.h && !alpha; y++) for (let x = f.x; x < f.x + f.w; x++) alpha |= data[(y * info.width + x) * 4 + 3];
  if (!alpha) throw new Error(`${f.name}: frame is fully transparent, wrong coordinates?`);
  f.png = await sharp(data, { raw: info }).extract({ left: f.x, top: f.y, width: f.w, height: f.h })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).png().toBuffer();
}
for (const [a, list] of Object.entries(animations)) for (const n of list) if (!names.has(n)) throw new Error(`animation ${a} -> missing ${n}`);

// Shelf packing, tallest first; frame sizes here are few and uniform, so shelves waste little.
const order = [...frames].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
let x = 0, y = 0, shelf = 0;
for (const f of order) {
  const w = f.w + 2 * PAD, h = f.h + 2 * PAD;
  if (x + w > ATLAS_WIDTH) { x = 0; y += shelf; shelf = 0; }
  f.ax = x; f.ay = y; x += w; shelf = Math.max(shelf, h);
}
const atlasHeight = Math.ceil((y + shelf) / 4) * 4;

await mkdir(join(OUT, 'fonts'), { recursive: true });
await mkdir(BUILD, { recursive: true });
await sharp({ create: { width: ATLAS_WIDTH, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(order.map(f => ({ input: f.png, left: f.ax, top: f.ay })))
  .png({ compressionLevel: 9, palette: false }).toFile(join(OUT, 'atlas.png'));

const json = {
  frames: Object.fromEntries(frames.map(f => [f.name, {
    frame: { x: f.ax + PAD, y: f.ay + PAD, w: f.w, h: f.h },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
    sourceSize: { w: f.w, h: f.h },
  }])),
  animations,
  meta: { app: 'paperclip-overlord/assets-src/build-atlas.mjs', image: 'atlas.png', format: 'RGBA8888', size: { w: ATLAS_WIDTH, h: atlasHeight }, scale: 1 },
};
await writeFile(join(OUT, 'atlas.json'), JSON.stringify(json, null, 1) + '\n');

await copyFile(join(VENDOR, 'm5x7/m5x7.ttf'), join(OUT, 'fonts/m5x7.ttf'));
await copyFile(join(VENDOR, 'press-start-2p/PressStart2P-Regular.ttf'), join(OUT, 'fonts/PressStart2P-Regular.ttf'));
await copyFile(join(VENDOR, 'press-start-2p/OFL.txt'), join(OUT, 'fonts/PressStart2P-OFL.txt'));

// Contact sheet: every frame at 3x on a checker-free dark cell, labelled with its name.
const SCALE = 3, CELL_W = 170, LABEL = 12, SHEET_W = 1700; // 170 px fits the longest label at 10 px monospace
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const parts = [];
let cx = 0, cy = 0, rowH = 0;
for (const f of frames) {
  const w = Math.max(CELL_W, f.w * SCALE + 4), h = f.h * SCALE + LABEL + 6;
  if (cx + w > SHEET_W) { cx = 0; cy += rowH; rowH = 0; }
  const img = await sharp(f.png).extract({ left: PAD, top: PAD, width: f.w, height: f.h })
    .resize(f.w * SCALE, f.h * SCALE, { kernel: 'nearest' }).png().toBuffer();
  parts.push({ input: Buffer.from(`<svg width="${w}" height="${LABEL}"><text x="2" y="10" font-size="10" font-family="monospace" fill="#e8e8e8">${esc(f.name)}</text></svg>`), left: cx, top: cy });
  parts.push({ input: img, left: cx + 2, top: cy + LABEL });
  cx += w; rowH = Math.max(rowH, h);
}
await sharp({ create: { width: SHEET_W, height: cy + rowH, channels: 4, background: '#3a3f4b' } })
  .composite(parts).png().toFile(join(BUILD, 'contact-sheet.png'));

console.log(`atlas: ${frames.length} frames, ${Object.keys(animations).length} animations, ${ATLAS_WIDTH}x${atlasHeight} -> assets/atlas.png, assets/atlas.json`);
console.log('contact sheet -> assets-src/build/contact-sheet.png');
