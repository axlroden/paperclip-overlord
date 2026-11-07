// Packs the PixelLab cast (pixellab/out/*) into assets/cast.png + a Pixi v8 spritesheet assets/cast.json.
// Rotations (48 px) and animation frames (68 px canvases) get per-frame anchors at the feet so every
// sprite of a character lines up when placed at the same point. Frame 0 of each animation is the
// reference pose PixelLab keeps, so it is dropped from the loop.
// Run: npm --prefix assets-src run cast
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'pixellab', 'out');
const UNZIP = join(HERE, 'build', 'cast-unzip');
const OUT = join(HERE, '..', 'assets');
const ATLAS_WIDTH = 1024;
const PAD = 1;

const frames = []; // { name, file }
const animations = {};

/** Unzip a character export once; returns its root. */
function unzipped(step) {
  const dir = join(UNZIP, step);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', join(SRC, step, 'character.zip'), '-d', dir]);
  }
  return dir;
}

// A "<step>-fix" step (an edit of <step>) replaces its original under the original's name.
const steps = readdirSync(SRC);
const fixed = new Set(steps.filter((s) => s.endsWith('-fix')).map((s) => s.slice(0, -4)));
for (const step of steps) {
  if (fixed.has(step)) continue;
  const dir = join(SRC, step);
  const outName = step.endsWith('-fix') ? step.slice(0, -4) : step;
  if (existsSync(join(dir, 'character.zip'))) {
    // animation step: frames under <state>/animations/<name>/<direction>/frame_NNN.png
    const root = unzipped(step);
    for (const state of readdirSync(root).filter((d) => !d.endsWith('.json'))) {
      const animRoot = join(root, state, 'animations');
      if (!existsSync(animRoot)) continue;
      for (const name of readdirSync(animRoot)) {
        if (name !== step) continue; // each zip carries every animation so far; take only this step's
        for (const dirn of readdirSync(join(animRoot, name))) {
          const files = readdirSync(join(animRoot, name, dirn)).filter((f) => f.endsWith('.png')).sort().slice(1);
          const key = `${name}/${dirn}`;
          animations[key] = files.map((f, i) => {
            frames.push({ name: `${key}_${i}`, file: join(animRoot, name, dirn, f) });
            return `${key}_${i}`;
          });
        }
      }
    }
  } else {
    // character rotations (<direction>.png) or edit results (0.png)
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
      frames.push({ name: `${outName}/${f.replace('.png', '')}`, file: join(dir, f) });
    }
  }
}

// Backdrop clean-up: brighten rooms that came out too dark, and fill the near-black bands PixelLab
// sometimes leaves on the top/bottom edge by repeating the nearest real row.
const BRIGHTEN = { 'bg-sweatshop/0': 1.6 };
async function backdrop(f) {
  let img = sharp(f.file).ensureAlpha();
  if (BRIGHTEN[f.name]) img = img.modulate({ brightness: BRIGHTEN[f.name] });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const row = (y) => data.subarray(y * info.width * 4, (y + 1) * info.width * 4);
  const dark = (y) => { const r = row(y); let n = 0; for (let i = 0; i < r.length; i += 4) if (r[i] + r[i + 1] + r[i + 2] < 40) n++; return n > info.width * 0.9; };
  let top = 0; while (top < info.height / 4 && dark(top)) top++;
  let bottom = info.height - 1; while (bottom > info.height * 0.75 && dark(bottom)) bottom--;
  for (let y = 0; y < top; y++) row(y).set(row(top));
  for (let y = bottom + 1; y < info.height; y++) row(y).set(row(bottom));
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Feet anchor per frame: bottom-most opaque row, horizontal centre of the opaque span on that body.
async function load(f) {
  if (f.name.startsWith('bg-')) {
    const buf = await backdrop(f);
    const meta = await sharp(buf).metadata();
    return { ...f, w: meta.width, h: meta.height, buf, feet: { x: 0, y: 0 } };
  }
  const img = sharp(f.file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  }
  return { ...f, w: info.width, h: info.height, buf: await sharp(f.file).png().toBuffer(), feet: maxY < 0 ? { x: 0.5, y: 1 } : { x: (minX + maxX + 1) / 2 / info.width, y: (maxY + 1) / info.height } };
}
const loaded = await Promise.all(frames.map(load));

// Anchor animation frames by the animation's FIRST frame so the body does not swim as limbs move.
for (const [key, names] of Object.entries(animations)) {
  const first = loaded.find((f) => f.name === names[0]);
  for (const n of names) loaded.find((f) => f.name === n).feet = first.feet;
}

// Shelf packing.
let x = 0, y = 0, rowH = 0;
for (const f of loaded.sort((a, b) => b.h - a.h || a.name.localeCompare(b.name))) {
  if (x + f.w + PAD * 2 > ATLAS_WIDTH) { x = 0; y += rowH; rowH = 0; }
  f.x = x + PAD; f.y = y + PAD;
  x += f.w + PAD * 2; rowH = Math.max(rowH, f.h + PAD * 2);
}
const height = y + rowH;

mkdirSync(OUT, { recursive: true });
await sharp({ create: { width: ATLAS_WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(loaded.map((f) => ({ input: f.buf, left: f.x, top: f.y })))
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'cast.png'));

const json = {
  frames: Object.fromEntries(loaded.map((f) => [f.name, {
    frame: { x: f.x, y: f.y, w: f.w, h: f.h },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
    sourceSize: { w: f.w, h: f.h },
    anchor: f.feet,
  }])),
  animations,
  meta: { app: 'paperclip-overlord build-cast.mjs', image: 'cast.png', format: 'RGBA8888', size: { w: ATLAS_WIDTH, h: height }, scale: 1 },
};
await writeFile(join(OUT, 'cast.json'), `${JSON.stringify(json, null, 1)}\n`);
rmSync(UNZIP, { recursive: true, force: true });
console.log(`cast: ${loaded.length} frames, ${Object.keys(animations).length} animations, ${ATLAS_WIDTH}x${height}`);
