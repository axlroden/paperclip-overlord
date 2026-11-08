// Where the work happens inside each generated backdrop, measured in the backdrop's own FINE pixels
// (assets-src/pixellab/out/bg-<site>/0.png). Workers stand on the slots; each swing throws its
// strike effect at the slot's tool point; the room's machinery is animated by siteAmbient().
import type { Graphics } from "pixi.js";
import type { SiteId } from "../../shared/world.js";
import { C } from "./pixels.js";
import { SITE_BOXES, type Box } from "./scene.js";

export type StrikeKind = "chips" | "coal" | "sparks" | "splash" | "tokens" | "fabric" | "power";

/** A worker spot: feet at (x, y), facing, and where its tool lands (dx from the feet, dy up). */
export interface Slot { x: number; y: number; facing: 1 | -1; tool: [number, number] }

export interface Station {
  slots: Slot[];
  strike: StrikeKind;
  /** Where strike debris is delivered (fine px), e.g. the coal cart or the furnace mouth. */
  sink?: [number, number];
  /** Frame of the 8-frame work loop where the tool connects. */
  impact: number;
}

const s = (x: number, y: number, facing: 1 | -1, tool: [number, number]): Slot => ({ x, y, facing, tool });

export const STATIONS: Record<SiteId, Station> = {
  // hack the coal face on the left; chunks fly into the cart
  "coal-mine": { strike: "coal", impact: 4, sink: [134, 58], slots: [s(44, 84, -1, [-14, 16]), s(70, 84, -1, [-14, 16]), s(96, 84, -1, [-14, 16]), s(28, 84, -1, [-14, 16])] },
  // at the sewing tables on both sides of the room
  sweatshop: { strike: "fabric", impact: 3, slots: [s(36, 84, 1, [12, 22]), s(62, 84, -1, [-12, 22]), s(146, 84, 1, [12, 22]), s(172, 84, -1, [-12, 22])] },
  // smash the boulder piles
  quarry: { strike: "chips", impact: 4, slots: [s(84, 78, -1, [-14, 14]), s(104, 76, 1, [14, 14]), s(60, 80, -1, [-14, 14]), s(132, 76, 1, [14, 14])] },
  // running inside the two great wheels, extra hands in the server aisle
  treadwheel: { strike: "power", impact: 2, slots: [s(54, 70, 1, [0, 30]), s(202, 72, 1, [0, 30]), s(125, 84, 1, [0, 30])] },
  // ladle at the molten pour, hammer at the anvils; new steel lands on the rack
  foundry: { strike: "sparks", impact: 4, sink: [204, 60], slots: [s(94, 82, 1, [16, 14]), s(146, 82, -1, [-16, 14]), s(62, 82, 1, [14, 20]), s(178, 82, -1, [-14, 20])] },
  // wading in the sludge channel
  sewer: { strike: "splash", impact: 4, slots: [s(125, 86, 1, [12, 4]), s(104, 82, 1, [12, 4]), s(146, 82, -1, [-12, 4])] },
  // shovel tokens into the Machine God's furnace
  "token-refinery": { strike: "tokens", impact: 5, sink: [88, 92], slots: [s(44, 124, 1, [14, 18]), s(62, 124, 1, [14, 18]), s(124, 124, -1, [-14, 18]), s(142, 124, -1, [-14, 18])] },
};

/** Fine px in a site's backdrop -> world coarse units. */
export function siteToWorld(site: SiteId, fx: number, fy: number): [number, number] {
  const b: Box = SITE_BOXES[site];
  return [b.x + fx / 2, b.y + fy / 2];
}

/**
 * The room machinery, drawn every frame over the backdrops (world coarse units, half-unit steps are
 * fine pixels). `busy` is how many workers the room has; idle machinery still turns slowly.
 */
export function siteAmbient(g: Graphics, site: SiteId, now: number, busy: number) {
  const w = (fx: number, fy: number) => siteToWorld(site, fx, fy);
  const t = now / 1000;
  switch (site) {
    case "treadwheel": {
      for (const [cx, cy, r] of [[54, 38, 30], [202, 40, 32]] as const) {
        const [x, y] = w(cx, cy);
        const rr = r / 2;
        g.circle(x, y, rr).fill({ color: 0x141a2a, alpha: 0.85 });
        const spin = t * (busy ? 1.6 + busy * 0.6 : 0.25);
        for (let i = 0; i < 6; i++) {
          const a = spin + (i * Math.PI) / 3;
          g.moveTo(x, y).lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr).stroke({ width: 1, color: 0x3a4466 });
          g.moveTo(x, y).lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr).stroke({ width: 0.5, color: i % 2 ? 0xfeae34 : 0x8b9bb4 });
        }
        g.circle(x, y, 2.5).fill(0x3a4466); g.circle(x, y, 1).fill(0x8b9bb4);
      }
      // racks blink harder with more hands on the wheels
      for (let i = 0; i < 14; i++) {
        if ((Math.floor(t * (busy ? 8 : 2)) + i * 7) % 5) continue;
        const [x, y] = w(104 + (i % 2) * 40 + (i % 5) * 1.5, 18 + (i * 5) % 50);
        g.rect(x, y, 0.5, 0.5).fill(i % 3 ? 0x2ce8f5 : 0x63c74d);
      }
      break;
    }
    case "foundry": {
      // the molten pour runs down, the basin churns
      for (let i = 0; i < 18; i++) {
        const fy = (t * 60 + i * 9) % 58;
        const [x, y] = w(113 + ((i * 5) % 11), 6 + fy);
        g.rect(x, y, 0.5, 1.5).fill({ color: i % 3 ? C.yellow : C.white, alpha: 0.9 });
      }
      for (let i = 0; i < 6; i++) {
        const [x, y] = w(104 + ((i * 7 + Math.floor(t * 6)) % 32), 60 + Math.sin(t * 4 + i) * 2);
        g.rect(x, y, 1, 0.5).fill({ color: C.yellow, alpha: 0.8 });
      }
      break;
    }
    case "sewer": {
      // sludge streaks flow towards the viewer down the channel
      for (let i = 0; i < 16; i++) {
        const p = ((t * 0.25 + i / 16) % 1);
        const fy = 50 + p * 36;
        const half = 6 + p * 34;
        const [x, y] = w(125 - half + ((i * 13) % 10) / 10 * half * 2, fy);
        g.rect(x, y, 1 + p * 2, 0.5).fill({ color: 0xd2f5e3, alpha: 0.35 + p * 0.4 });
      }
      break;
    }
    case "token-refinery": {
      // furnace fire flickers, coins ride the conveyor up to the hopper
      const [fx, fy] = w(72, 72);
      g.rect(fx, fy, 17, 18).fill({ color: C.orange, alpha: 0.12 + 0.12 * Math.abs(Math.sin(t * (busy ? 9 : 3))) });
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.18 + i / 6) % 1;
        const [x, y] = w(180 + p * 84, 116 - p * 54);
        g.rect(x - 0.75, y - 0.75, 1.5, 1.5).fill(C.gold);
        g.rect(x - 0.25, y - 0.75, 0.5, 0.5).fill(C.yellow);
      }
      break;
    }
    case "coal-mine": {
      for (const [lx, ly] of [[146, 28], [156, 36]] as const) {
        const [x, y] = w(lx, ly);
        g.circle(x, y, 3 + Math.sin(t * 7 + lx) * 0.6).fill({ color: C.amber, alpha: 0.18 });
      }
      break;
    }
    case "sweatshop": {
      const [x, y] = w(82, 25);
      if (Math.sin(t * 13) > -0.7) g.circle(x, y, 4).fill({ color: C.yellow, alpha: 0.16 });
      break;
    }
    default:
      break;
  }
}
