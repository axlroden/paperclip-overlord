// Nearest-neighbour preview sheet of PNG frames: node preview.mjs <out.png> <scale> <frames...>
import sharp from "sharp";
const [out, scale, ...files] = process.argv.slice(2);
const s = Number(scale);
const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const w = Math.max(...metas.map((m) => m.width)) * s;
const h = Math.max(...metas.map((m) => m.height)) * s;
const tiles = await Promise.all(files.map((f, i) => sharp(f).resize(metas[i].width * s, metas[i].height * s, { kernel: "nearest" }).png().toBuffer()));
await sharp({ create: { width: w * files.length, height: h, channels: 4, background: "#3a4466" } })
  .composite(tiles.map((input, i) => ({ input, left: i * w, top: 0 })))
  .png().toFile(out);
