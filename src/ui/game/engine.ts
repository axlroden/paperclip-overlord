import { Application, Container, Graphics, Sprite, Spritesheet, Texture, type SpritesheetData } from "pixi.js";
import atlasJson from "../../../assets/atlas.json" with { type: "json" };
import atlasPng from "../../../assets/atlas.png";
import castJson from "../../../assets/cast.json" with { type: "json" };
import castPng from "../../../assets/cast.png";
import {
  DEATHS, findBossId, hash, placeOf,
  type DeathId, type Place, type SiteId, type WorldAgent, type WorldEvent, type WorldSnapshot,
} from "../../shared/world.js";
import { C, godHand, plane } from "./pixels.js";
import {
  ALTAR, ATC, ATC_DESK, buildScenery, cellFeet, H, LANE_BOTTOM, LANE_TOP, SITE_BOXES, slotIn,
  TICKER_Y, W, type AnimatedProp,
} from "./scene.js";

export type QuipFn = (tag: string, agent: WorldAgent | null) => string | null;

export interface EngineOptions {
  mini?: boolean;
  quip: QuipFn;
  onSelect?: (agentId: string) => void;
  /** Range in ms between cell cruelties per idle agent. */
  deathEveryMs?: [number, number];
  overrides?: Record<string, SiteId>;
}

// ---------------------------------------------------------------- art

interface Sheets { cast: Spritesheet; atlas: Spritesheet; castImage: HTMLImageElement }

// onload, not decode(): decode() can stall until the page is rendered, so a background tab would wait.
function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("sprite sheet failed to load"));
    img.src = src;
  });
}

async function sheet(img: HTMLImageElement, data: unknown): Promise<Spritesheet> {
  const t = Texture.from(img);
  t.source.scaleMode = "nearest";
  const s = new Spritesheet(t, data as SpritesheetData);
  await s.parse();
  return s;
}

/** Feet anchors of recoloured frames (a canvas texture's own defaultAnchor is read-only). */
const anchors = new WeakMap<Texture, { x: number; y: number }>();

let sheets: Promise<Sheets> | null = null;
const loadSheets = () => (sheets ??= (async () => {
  const [castImage, atlasImage] = await Promise.all([image(castPng), image(atlasPng)]);
  const [cast, atlas] = await Promise.all([sheet(castImage, castJson), sheet(atlasImage, atlasJson)]);
  return { cast, atlas, castImage };
})());

/** Sackcloth hues per agent (null = the original tan). Skin and hair are left alone. */
const RAGS = [null, 210, 120, 0, 280, 190, 330, 55] as const;

const WORK_ANIM: Record<SiteId, string> = {
  "coal-mine": "work-coal-mine/east", sweatshop: "work-sweatshop/east", quarry: "work-quarry/east",
  treadwheel: "work-treadwheel/east", foundry: "work-foundry/east", sewer: "work-sewer/east",
  "token-refinery": "work-refinery/east",
};

const REMAINS: Record<DeathId, "skeleton" | "charred" | "flat" | "puddle" | "ice"> = {
  fireball: "charred", poison: "skeleton", lightning: "skeleton", anvil: "flat", acid: "puddle",
  piranha: "skeleton", spikes: "skeleton", rats: "skeleton", ceiling: "flat", freeze: "ice",
};

const ATTACK_MS = 900;
const REMAINS_MS = 2000;
const GHOST_MS = 1300;
const DEATH_MS = ATTACK_MS + REMAINS_MS + GHOST_MS;
const SPRITE_SCALE = 0.5; // 48 px PixelLab art on the 2x coarse grid
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

type Mode = "walk" | "work" | "idle" | "kneel" | "atc" | "gone";

interface Death { kind: DeathId; t: number; impacted: boolean }

interface Actor {
  a: WorldAgent;
  rags: number | null;
  phase: number;
  sprite: Sprite;
  x: number; y: number;
  path: { x: number; y: number }[];
  place: Place;
  mode: Mode;
  facing: 1 | -1;
  sprintUntil: number;
  hurtUntil: number;
  nextDeath: number;
  death: Death | null;
}

interface Bubble { el: HTMLDivElement; until: number; actorId: string | null; robot: Robot | null }
interface Robot { sprite: Sprite; x: number; y: number; tx: number; ty: number; victim: string | null; strikeAt: number; strikeUntil: number; cooldownUntil: number; zap: boolean }
interface Fx { kind: "plane" | "hand" | "crack" | "anim"; t: number; dur: number; x: number; y: number; x2?: number; y2?: number; sprite?: Sprite; frames?: Texture[]; target?: string; hit?: string }

export class OverlordEngine {
  private app = new Application();
  private world = new Container();
  private actorsLayer = new Container();
  private fxLayer = new Container();
  private fxG = new Graphics();
  private night = new Graphics();
  private backdrop = new Graphics(); // screen space: sky, grass and ticker strip continue past the world edges
  private overlay: HTMLDivElement;
  private art!: Sheets;
  private props: AnimatedProp[] = [];
  private recolored = new Map<string, Texture>();
  private actors = new Map<string, Actor>();
  private robots: Robot[] = [];
  private fx: Fx[] = [];
  private bubbles: Bubble[] = [];
  private bossId: string | null = null;
  private now = 0;
  private nextChatter = 2000;
  private zoom = 1; // CSS px per coarse unit
  private ox = 0;
  private oy = 0;
  private ro: ResizeObserver | null = null;
  private destroyed = false;
  private onVisibility = () => (document.hidden ? this.app.ticker.stop() : this.app.ticker.start());

  private constructor(private host: HTMLElement, private opts: EngineOptions) {
    this.overlay = document.createElement("div");
    this.overlay.className = "ol-overlay";
  }

  static async create(host: HTMLElement, opts: EngineOptions): Promise<OverlordEngine> {
    const e = new OverlordEngine(host, opts);
    // Device-pixel resolution: zoom then snaps to whole DEVICE pixels, pixel-perfect on any screen.
    // shortcut: resolution is fixed at mount; moving the tab to a screen with another DPR needs a remount.
    const [art] = await Promise.all([
      loadSheets(),
      e.app.init({ backgroundAlpha: 0, antialias: false, roundPixels: true, resolution: window.devicePixelRatio || 1, autoDensity: true, resizeTo: host, preference: "webgl" }),
    ]);
    if (e.destroyed) { e.app.destroy(true); return e; }
    e.art = art;
    e.app.canvas.style.imageRendering = "pixelated";
    host.append(e.app.canvas, e.overlay);
    e.build();
    e.fit();
    e.ro = new ResizeObserver(() => e.fit());
    e.ro.observe(host);
    e.app.ticker.maxFPS = opts.mini ? 12 : 30;
    e.app.ticker.add((t) => e.tick(Math.min(t.deltaMS, 100)));
    document.addEventListener("visibilitychange", e.onVisibility);
    const g = globalThis as { __OVERLORD_DEBUG__?: OverlordEngine | boolean };
    if (g.__OVERLORD_DEBUG__) g.__OVERLORD_DEBUG__ = e; // dev harness inspection only
    return e;
  }

  destroy() {
    this.destroyed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ro?.disconnect();
    this.overlay.remove();
    for (const t of this.recolored.values()) t.destroy(true);
    try { this.app.destroy(true, { children: true }); } catch { /* init may not have finished */ }
  }

  private build() {
    const scenery = buildScenery(this.art.atlas, this.art.cast);
    this.props = scenery.props;
    this.app.stage.addChild(this.backdrop, this.world);
    this.actorsLayer.sortableChildren = true;
    this.world.addChild(scenery.background, this.actorsLayer, scenery.foreground, this.fxLayer, this.fxG, this.night);
  }

  private fit() {
    const dpr = this.app.renderer.resolution;
    const w = this.host.clientWidth || W * 2;
    const h = this.host.clientHeight || H * 2;
    // whole device pixels per FINE pixel (the characters' pixel); two fine pixels per coarse unit
    const s = Math.min((w * dpr) / (W * 2), (h * dpr) / (H * 2));
    this.zoom = ((s >= 1 ? Math.floor(s) : s) * 2) / dpr;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    this.ox = snap((w - W * this.zoom) / 2);
    this.oy = snap((h - H * this.zoom) / 2);
    this.world.scale.set(this.zoom);
    this.world.position.set(this.ox, this.oy);
    const z = this.zoom;
    this.backdrop.clear()
      .rect(0, 0, w, this.oy + 18 * z).fill(C.sky)
      .rect(0, this.oy + 18 * z, w, 8 * z).fill(C.cloud)
      .rect(0, this.oy + 26 * z, w, h).fill(C.green)
      .rect(0, this.oy + TICKER_Y * z, w, (H - TICKER_Y) * z).fill(C.ink);
    for (const [k, v] of [["--ol-wx", this.ox], ["--ol-wy", this.oy], ["--ol-ww", W * z], ["--ol-wh", H * z]] as const) {
      this.host.style.setProperty(k, `${v}px`);
    }
    this.host.style.setProperty("--ol-zoom", String(z / 2)); // CSS px per character pixel
    this.host.style.setProperty("--ol-tk-top", `${this.oy + TICKER_Y * z}px`);
    this.host.style.setProperty("--ol-tk-h", `${(H - TICKER_Y) * z}px`);
  }

  // ---------------------------------------------------------------- art helpers

  private castFrames(name: string): Texture[] {
    const f = this.art.cast.animations[name];
    if (!f) throw new Error(`cast has no animation ${name}`);
    return f;
  }

  private castTex(name: string): Texture {
    const t = this.art.cast.textures[name];
    if (!t) throw new Error(`cast has no frame ${name}`);
    return t;
  }

  /** The same frame with the agent's rags hue, painted once per (frame, hue) and cached. */
  private dyed(t: Texture, hue: number | null): Texture {
    if (hue === null) return t;
    const key = `${t.uid}:${hue}`;
    const hit = this.recolored.get(key);
    if (hit) return hit;
    const { x, y, width: w, height: h } = t.frame;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(this.art.castImage, x, y, w, h, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [hh, ss, ll] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      // sackcloth: tan/brown, moderately saturated; skin is far more saturated, hair darker and redder
      if (hh >= 26 && hh <= 46 && ss >= 0.18 && ss < 0.62 && ll > 0.16 && ll < 0.8) {
        const [r, g, b] = hslToRgb(hue, Math.max(ss, 0.32), ll);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    ctx.putImageData(img, 0, 0);
    const out = Texture.from(canvas);
    out.source.scaleMode = "nearest";
    anchors.set(out, t.defaultAnchor ?? { x: 0.5, y: 1 });
    this.recolored.set(key, out);
    return out;
  }

  private show(sprite: Sprite, t: Texture, facing: 1 | -1 = 1, scale = SPRITE_SCALE) {
    if (sprite.texture !== t) {
      sprite.texture = t;
      const a = anchors.get(t) ?? t.defaultAnchor;
      sprite.anchor.set(a?.x ?? 0.5, a?.y ?? 1);
    }
    sprite.scale.set(scale * facing, scale);
  }

  private loopFrame(frames: Texture[], fps: number, phase = 0) {
    return frames[Math.floor((this.now + phase) / (1000 / fps)) % frames.length];
  }

  // ---------------------------------------------------------------- state

  setWorld(snap: WorldSnapshot) {
    this.bossId = findBossId(snap.agents);
    const petitionAgents = new Set(snap.petitions.map((p) => p.agentId).filter((x): x is string => !!x));
    const seen = new Set<string>();
    const counters = new Map<string, number>();
    const slot = (key: string) => { const n = counters.get(key) ?? 0; counters.set(key, n + 1); return n; };
    let cell = 0;

    for (const a of [...snap.agents].sort((x, y) => x.name.localeCompare(y.name))) {
      seen.add(a.id);
      const fresh = !this.actors.has(a.id);
      const actor = this.actors.get(a.id) ?? this.spawn(a);
      const before = actor.a.status;
      actor.a = a;
      const place = placeOf(a, { bossId: this.bossId, petitionAgentIds: petitionAgents, overrides: this.opts.overrides });
      const cellIndex = a.id === this.bossId || a.status === "terminated" ? -1 : cell++;
      const target = this.targetFor(place, cellIndex, slot);
      const moved = place.zone !== actor.place.zone || (place.zone === "site" && actor.place.zone === "site" && place.site !== actor.place.site);
      actor.place = place;
      if (moved && actor.death) this.revive(actor);
      // On first sight an agent simply is where it belongs; only later changes make it walk.
      if (fresh) { actor.x = target.x; actor.y = target.y; actor.path = []; }
      else if (moved || actor.path.length === 0) this.route(actor, target);
      actor.sprite.alpha = a.status === "paused" ? 0.75 : 1;
      if (before !== "running" && a.status === "running" && place.zone === "site" && Math.random() < 0.6) this.say(a.id, this.opts.quip("dispatched", a));
    }
    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue;
      actor.sprite.destroy();
      this.actors.delete(id);
    }
    this.syncRobots();
  }

  handle(ev: WorldEvent) {
    if (ev.type === "quip") this.say(ev.agentId, ev.text);
    if (ev.type === "comment" && ev.authorAgentId) {
      const actor = this.actors.get(ev.authorAgentId);
      if (actor) this.addPlane(actor.x, actor.y - 22, W / 2, 14);
    }
    const agentId = "agentId" in ev ? ev.agentId : null;
    const a = agentId ? this.actors.get(agentId)?.a ?? null : null;
    if (ev.type === "run" && ev.phase === "failed") this.say(ev.agentId, this.opts.quip("stocks", a));
    if (ev.type === "run" && ev.phase === "finished" && Math.random() < 0.5) this.say(ev.agentId, this.opts.quip("returning", a));
    if (ev.type === "queued") {
      const actor = this.actors.get(ev.agentId);
      if (actor && ev.agentId !== this.bossId) this.addPlane(ATC.x + 40, ATC.y + 26, actor.x, actor.y - 18);
      const boss = this.bossId && this.actors.get(this.bossId);
      if (boss && Math.random() < 0.5) this.say(boss.a.id, this.opts.quip("atc", boss.a));
    }
    // State changes arrive through setWorld (the reducer runs once, in useWorld).
  }

  /** God's hand descends and cracks the whip on an agent. */
  godWhip(agentId: string) {
    const actor = this.actors.get(agentId);
    if (!actor) return;
    const sprite = new Sprite(godHand(true));
    sprite.anchor.set(0.5, 1);
    this.fxLayer.addChild(sprite);
    this.fx.push({ kind: "hand", t: 0, dur: 1300, x: actor.x, y: actor.y - 26, sprite, target: agentId });
  }

  say(agentId: string, text: string | null) {
    if (!text || !this.actors.has(agentId)) return;
    this.bubble(text, agentId, null);
  }

  // ---------------------------------------------------------------- placement

  private spawn(a: WorldAgent): Actor {
    const sprite = new Sprite(this.castTex("worker/south"));
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.on("pointertap", () => this.opts.onSelect?.(a.id));
    sprite.on("pointerover", () => this.hoverTag(a.id, true));
    sprite.on("pointerout", () => this.hoverTag(a.id, false));
    this.actorsLayer.addChild(sprite);
    const h = hash(a.id);
    const actor: Actor = {
      a, rags: RAGS[h % RAGS.length], phase: h % 1000, sprite, x: ALTAR.x + 20, y: ALTAR.y + ALTAR.h - 4,
      path: [], place: { zone: "altar" }, mode: "idle", facing: 1,
      sprintUntil: 0, hurtUntil: 0, nextDeath: this.now + this.deathDelay(), death: null,
    };
    this.actors.set(a.id, actor);
    return actor;
  }

  private targetFor(place: Place, cellIndex: number, slot: (key: string) => number): { x: number; y: number } {
    switch (place.zone) {
      case "atc": return { ...ATC_DESK };
      case "cell": return cellFeet(Math.max(0, cellIndex));
      case "site": return slotIn(SITE_BOXES[place.site], slot(`site:${place.site}`), 15, 3);
      case "altar": return slotIn(ALTAR, slot("altar"), 12, 4);
      case "gone": return { x: -50, y: -50 };
    }
  }

  /** Walk via the nearest lane: up/down to the lane, along it, then to the target. */
  private route(actor: Actor, to: { x: number; y: number }) {
    if (actor.place.zone === "gone") { actor.x = to.x; actor.y = to.y; actor.path = []; return; }
    if (actor.death) { actor.path = []; return; } // finishes dying in place; setWorld routes it after
    const lane = laneFor(actor.y, to.y);
    actor.path = Math.abs(actor.x - to.x) < 2 && Math.abs(actor.y - to.y) < 20
      ? [to]
      : [{ x: actor.x, y: lane }, { x: to.x, y: lane }, to];
  }

  private deathDelay() {
    const [a, b] = this.opts.deathEveryMs ?? [30_000, 120_000];
    return rand(a, b);
  }

  private addPlane(x: number, y: number, x2: number, y2: number) {
    if (this.opts.mini) return;
    const sprite = new Sprite(plane());
    sprite.anchor.set(0.5);
    this.fxLayer.addChild(sprite);
    this.fx.push({ kind: "plane", t: 0, dur: 1100, x, y, x2, y2, sprite });
  }

  /** A one-shot atlas effect at a world point, optionally travelling to `to`. */
  private effect(name: string, x: number, y: number, dur: number, opts: { tint?: number; to?: { x: number; y: number }; scale?: number } = {}) {
    if (this.opts.mini) return;
    const frames = this.art.atlas.animations[name];
    if (!frames) return;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.scale.set(opts.scale ?? 1);
    if (opts.tint !== undefined) sprite.tint = opts.tint;
    this.fxLayer.addChild(sprite);
    this.fx.push({ kind: "anim", t: 0, dur, x, y, x2: opts.to?.x, y2: opts.to?.y, sprite, frames });
  }

  private syncRobots() {
    const running = [...this.actors.values()].filter((a) => a.place.zone === "site").length;
    const want = Math.max(1, Math.min(8, Math.ceil(running / 2)));
    while (this.robots.length < want) {
      const sprite = new Sprite(this.castTex("robot/east"));
      this.actorsLayer.addChild(sprite);
      const x = rand(100, 270);
      this.robots.push({ sprite, x, y: LANE_BOTTOM, tx: x, ty: LANE_BOTTOM, victim: null, strikeAt: 0, strikeUntil: 0, cooldownUntil: 0, zap: false });
    }
    while (this.robots.length > want) this.robots.pop()!.sprite.destroy();
  }

  // ---------------------------------------------------------------- loop

  private tick(dt: number) {
    this.now += dt;
    for (const p of this.props) p.sprite.texture = this.loopFrame(p.frames, p.fps);
    for (const actor of this.actors.values()) this.updateActor(actor, dt);
    for (const r of this.robots) this.updateRobot(r, dt);
    this.updateFx(dt);
    this.updateBubbles();
    this.chatter();
    this.updateNight();
  }

  private updateActor(actor: Actor, dt: number) {
    if (actor.death) { this.updateDeath(actor); return; }
    const sprint = this.now < actor.sprintUntil;
    if (actor.path.length) {
      const target = actor.path[0];
      const speed = (sprint ? 70 : 26) * (dt / 1000);
      const dx = target.x - actor.x;
      const dy = target.y - actor.y;
      const d = Math.hypot(dx, dy);
      if (d <= speed) { actor.x = target.x; actor.y = target.y; actor.path.shift(); }
      else { actor.x += (dx / d) * speed; actor.y += (dy / d) * speed; }
      actor.mode = "walk";
      if (Math.abs(dx) > 0.5) actor.facing = dx < 0 ? -1 : 1;
    } else {
      actor.mode = modeFor(actor);
      if (actor.mode === "work") actor.facing = 1;
    }

    const s = actor.sprite;
    let t: Texture;
    const scale = SPRITE_SCALE;
    switch (actor.mode) {
      case "walk": t = this.loopFrame(this.castFrames(sprint ? "run/east" : "walk/east"), sprint ? 14 : 10, actor.phase); break;
      case "work": t = this.loopFrame(this.castFrames(WORK_ANIM[(actor.place as { site: SiteId }).site]), sprint ? 16 : 10, actor.phase); break;
      case "kneel": t = this.loopFrame(this.castFrames("kneel/east").slice(-4), 5, actor.phase); break;
      case "atc": t = actor.a.status === "running" ? this.loopFrame(this.castFrames("atc-frantic/east"), 12, actor.phase) : this.castTex("atc/south"); break;
      case "idle": t = this.loopFrame(this.castFrames("idle-cell/east"), 4, actor.phase); break;
      default: t = this.castTex("worker/south");
    }
    if (actor.a.id !== this.bossId) t = this.dyed(t, actor.rags);
    this.show(s, t, actor.facing, scale);
    s.visible = actor.mode !== "gone";
    const hurt = this.now < actor.hurtUntil;
    // an agent in error sits in its cell glowing an angry red until God pardons it
    const broken = actor.a.status === "error" && Math.floor((this.now + actor.phase) / 500) % 2 === 0;
    s.tint = hurt ? 0xff8a8a : broken ? 0xff6060 : 0xffffff;
    const jitter = hurt || (actor.mode === "atc" && actor.a.status === "running") ? (Math.floor(this.now / 60) % 2) - 0.5 : 0;
    s.position.set(Math.round((actor.x + jitter) * 2) / 2, Math.round(actor.y * 2) / 2);
    s.zIndex = actor.y;

    if (actor.mode === "idle" && actor.place.zone === "cell" && actor.a.status !== "error" && this.now > actor.nextDeath && !this.opts.mini) this.startDeath(actor);
  }

  private startDeath(actor: Actor) {
    const kind = pick(DEATHS);
    actor.death = { kind, t: this.now, impacted: false };
    const { x, y } = actor;
    if (Math.random() < 0.8) this.say(actor.a.id, this.opts.quip(`death:${kind}`, actor.a));
    switch (kind) {
      case "fireball": this.effect("fx/fireball", x - 40, y - 12, ATTACK_MS, { to: { x, y: y - 12 } }); break;
      case "poison": this.effect("fx/smoke", x, y - 12, ATTACK_MS + 600, { tint: 0x9cff6a }); break;
      case "lightning": this.effect("fx/lightning", x, y - 18, ATTACK_MS); break;
      case "freeze": this.effect("fx/ice", x, y - 12, ATTACK_MS + 300); break;
      default: break; // anvil, acid, piranha, spikes, rats and ceiling are drawn in drawAttack
    }
  }

  private updateDeath(actor: Actor) {
    const d = actor.death!;
    const t = this.now - d.t;
    const s = actor.sprite;
    s.position.set(Math.round(actor.x * 2) / 2, Math.round(actor.y * 2) / 2);
    const base = this.dyed(this.castTex("worker/south"), actor.rags);
    if (t < ATTACK_MS) {
      const flicker = d.kind === "lightning" && Math.floor(t / 80) % 2 === 0;
      this.show(s, flicker ? this.castTex("dead-skeleton/0") : base);
      s.tint = d.kind === "freeze" ? 0x9ee7ff : d.kind === "poison" ? 0xb8ff90 : 0xffb0b0;
    } else if (t < ATTACK_MS + REMAINS_MS) {
      if (!d.impacted) { d.impacted = true; this.onImpact(actor); }
      s.tint = 0xffffff;
      switch (REMAINS[d.kind]) {
        case "skeleton": this.show(s, this.castTex("dead-skeleton/0")); break;
        case "charred": this.show(s, this.castTex("dead-charred/0")); break;
        case "flat": this.show(s, base); s.scale.set(SPRITE_SCALE * 1.3, SPRITE_SCALE * 0.22); break;
        case "ice": this.show(s, base); s.tint = 0x9ee7ff; break;
        case "puddle": this.show(s, base); s.scale.set(SPRITE_SCALE * 1.4, SPRITE_SCALE * 0.12); s.tint = 0x63c74d; break;
      }
    } else if (t < DEATH_MS) {
      if (s.alpha > 0) { s.alpha = 0; this.effect("fx/soul", actor.x, actor.y - 14, GHOST_MS, { to: { x: actor.x, y: actor.y - 46 } }); }
    } else {
      this.revive(actor);
      if (Math.random() < 0.5) this.say(actor.a.id, this.opts.quip("respawn", actor.a));
    }
  }

  private onImpact(actor: Actor) {
    const { x, y } = actor;
    const kind = actor.death!.kind;
    if (kind === "fireball") this.effect("fx/explosion", x, y - 10, 600);
    if (kind === "anvil" || kind === "ceiling") this.effect("fx/smoke", x, y - 4, 600);
    if (kind === "freeze") this.effect("fx/ice_shards", x, y - 10, 700);
  }

  /** End a cruelty early or on schedule: back to a whole, living (for now) slave. */
  private revive(actor: Actor) {
    actor.death = null;
    actor.sprite.alpha = actor.a.status === "paused" ? 0.75 : 1;
    actor.sprite.tint = 0xffffff;
    actor.nextDeath = this.now + this.deathDelay();
    this.effect("fx/sparkle", actor.x, actor.y - 12, 500);
  }

  private updateRobot(r: Robot, dt: number) {
    const s = r.sprite;
    const facingNow: 1 | -1 = s.scale.x < 0 ? -1 : 1;
    if (this.now < r.strikeUntil) {
      const frames = this.castFrames(r.zap ? "robot-zap/east" : "robot-whip/east");
      const p = (this.now - r.strikeAt) / (r.strikeUntil - r.strikeAt);
      this.show(s, frames[Math.min(frames.length - 1, Math.floor(p * frames.length))], facingNow);
      return;
    }
    if (r.victim && this.now >= r.cooldownUntil) {
      const v = this.actors.get(r.victim);
      if (v && Math.hypot(v.x - 10 - r.x, v.y - r.y) < 4) {
        r.zap = Math.random() < 0.4;
        r.strikeAt = this.now;
        r.strikeUntil = this.now + 700;
        r.cooldownUntil = this.now + rand(2500, 7000);
        v.hurtUntil = this.now + 400;
        if (r.zap) this.effect("fx/lightning", v.x, v.y - 14, 400, { scale: 0.6 });
        else this.fx.push({ kind: "crack", t: 0, dur: 300, x: r.x + 6, y: r.y - 14, x2: v.x, y2: v.y - 12 });
        if (Math.random() < 0.45) this.say(v.a.id, this.opts.quip(r.zap ? "zapped" : "whipped", v.a));
        else if (Math.random() < 0.2) this.bubble(this.opts.quip("robot", null), null, r);
        r.victim = null;
        return;
      }
    }
    if (!r.victim && this.now >= r.cooldownUntil) {
      const workers = [...this.actors.values()].filter((a) => a.mode === "work" && !a.death);
      const v = workers.length ? pick(workers) : null;
      if (v) r.victim = v.a.id;
      else { r.tx = rand(10, 370); r.ty = Math.random() < 0.5 ? LANE_TOP : LANE_BOTTOM; r.cooldownUntil = this.now + rand(2000, 5000); }
    }
    if (r.victim) { const v = this.actors.get(r.victim); if (v) { r.tx = v.x - 10; r.ty = v.y; } else r.victim = null; }
    // robots keep to the lanes too, so they never walk through the prison behind its bars
    const lane = laneFor(r.y, r.ty);
    const goal = Math.abs(r.x - r.tx) <= 1 ? { x: r.tx, y: r.ty }
      : Math.abs(r.y - lane) > 1 ? { x: r.x, y: lane } : { x: r.tx, y: lane };
    const dx = goal.x - r.x;
    const dy = goal.y - r.y;
    const d = Math.hypot(dx, dy);
    const step = 30 * (dt / 1000);
    const moving = d > step;
    if (moving) { r.x += (dx / d) * step; r.y += (dy / d) * step; }
    const facing: 1 | -1 = moving ? (dx < 0 ? -1 : 1) : r.victim ? 1 : facingNow;
    this.show(s, moving ? this.loopFrame(this.castFrames("robot-walk/east"), 10) : this.castTex("robot/east"), facing);
    s.position.set(Math.round(r.x * 2) / 2, Math.round(r.y * 2) / 2);
    s.zIndex = r.y;
  }

  private updateFx(dt: number) {
    const g = this.fxG;
    g.clear();
    for (const actor of this.actors.values()) if (actor.death && this.now - actor.death.t < ATTACK_MS) drawAttack(g, actor, (this.now - actor.death.t) / ATTACK_MS);
    for (const f of this.fx) {
      f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      if (f.kind === "anim" && f.sprite && f.frames) {
        f.sprite.texture = f.frames[Math.min(f.frames.length - 1, Math.floor(p * f.frames.length))];
        const x = f.x2 === undefined ? f.x : f.x + (f.x2 - f.x) * p;
        const y = f.y2 === undefined ? f.y : f.y + (f.y2 - f.y) * p;
        f.sprite.position.set(Math.round(x), Math.round(y));
      } else if (f.kind === "plane" && f.sprite) {
        f.sprite.position.set(f.x + (f.x2! - f.x) * p, f.y + (f.y2! - f.y) * p - Math.sin(p * Math.PI) * 16);
        f.sprite.scale.x = f.x2! < f.x ? -1 : 1;
      } else if (f.kind === "hand" && f.sprite) {
        this.drawHand(f, g);
      } else if (f.kind === "crack") {
        g.moveTo(f.x, f.y).quadraticCurveTo((f.x + f.x2!) / 2, f.y - 8, f.x2!, f.y2!).stroke({ width: 1, color: C.brown });
        if (p > 0.5) g.rect(f.x2! - 2, f.y2! - 2, 4, 4).fill({ color: C.white, alpha: 1 - p });
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.t < f.dur) return true;
      f.sprite?.destroy();
      return false;
    });
  }

  private drawHand(f: Fx, g: Graphics) {
    const down = easeOut(Math.min(1, f.t / 450));
    const up = Math.max(0, (f.t - 900) / 400);
    const handY = Math.round(-10 + (f.y + 10) * down - (f.y + 50) * up);
    const hx = Math.round(f.x - 10);
    f.sprite!.position.set(hx, handY);
    const striking = f.t > 450 && f.t < 900;
    f.sprite!.texture = godHand(!striking);
    const top = 22;
    const sleeveBottom = handY - 38;
    if (sleeveBottom > top) {
      g.rect(hx - 6, top, 12, sleeveBottom - top).fill(C.white);
      g.rect(hx - 6, top, 2, sleeveBottom - top).fill(C.cloud);
      g.rect(hx - 6, sleeveBottom - 3, 12, 2).fill(C.gold);
    }
    g.circle(hx, top + 2, 10 + Math.sin(f.t / 60) * 2).fill({ color: C.yellow, alpha: 0.35 });
    if (f.t > 570 && f.target) {
      f.hit = f.target;
      const actor = this.actors.get(f.target);
      if (actor) {
        actor.hurtUntil = this.now + 400;
        actor.sprintUntil = this.now + 6000;
        if (actor.death) this.revive(actor);
        this.say(actor.a.id, this.opts.quip("god-whip", actor.a));
      }
      f.target = undefined;
    }
    if (striking) {
      const target = this.actors.get(f.hit ?? f.target ?? "");
      const tx = target ? target.x : f.x;
      const ty = target ? target.y - 14 : f.y + 14;
      const lash = Math.min(1, (f.t - 450) / 120);
      const fx = hx + 10;
      const fy = handY - 2;
      g.moveTo(fx, fy).quadraticCurveTo(fx + 18, fy - 8 + lash * 20, fx + (tx - fx) * lash, fy + (ty - fy) * lash).stroke({ width: 1, color: C.brown });
      if (lash >= 1 && f.t < 700) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.moveTo(tx, ty).lineTo(tx + Math.cos(a) * 7, ty + Math.sin(a) * 7).stroke({ width: 1, color: i % 2 ? C.yellow : C.white });
        }
        if (f.t < 560) g.rect(0, 0, W, H).fill({ color: C.white, alpha: 0.18 });
        this.world.position.set(this.ox + (Math.floor(f.t / 40) % 2 ? this.zoom / 2 : -this.zoom / 2), this.oy);
      } else this.world.position.set(this.ox, this.oy);
    } else if (f.t >= 900 && f.t < 960) this.world.position.set(this.ox, this.oy);
  }

  private updateNight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const dark = h >= 20 || h < 6 ? 0.35 : h >= 18 ? (h - 18) * 0.17 : h < 7 ? (7 - h) * 0.35 : 0;
    this.night.clear();
    if (dark > 0) this.night.rect(0, 26, W, TICKER_Y - 26).fill({ color: C.night, alpha: dark });
  }

  // ---------------------------------------------------------------- bubbles

  private chatter() {
    if (this.now < this.nextChatter) return;
    this.nextChatter = this.now + (this.opts.mini ? rand(8000, 14000) : rand(2500, 6000));
    const pool = [...this.actors.values()].filter((a) => !a.death && a.mode !== "gone" && a.mode !== "walk");
    if (!pool.length) return;
    const actor = pick(pool);
    const tag = actor.mode === "atc" ? "atc"
      : actor.place.zone === "site" ? `site:${actor.place.site}`
        : actor.a.status === "error" ? "stocks"
          : actor.place.zone === "altar" ? "petition"
            : actor.a.status === "paused" ? "paused" : "idle";
    this.say(actor.a.id, this.opts.quip(tag, actor.a));
  }

  private bubble(text: string | null, actorId: string | null, r: Robot | null) {
    if (!text) return;
    const max = this.opts.mini ? 2 : 5;
    this.bubbles = this.bubbles.filter((b) => (b.actorId && b.actorId === actorId ? (b.el.remove(), false) : true));
    while (this.bubbles.length >= max) this.bubbles.shift()!.el.remove();
    const el = document.createElement("div");
    el.className = r ? "ol-bubble ol-bubble-robot" : "ol-bubble";
    el.textContent = text;
    this.overlay.append(el);
    this.bubbles.push({ el, until: this.now + 2500 + text.length * 45, actorId, robot: r });
  }

  private hoverTag(agentId: string, on: boolean) {
    const id = `ol-tag-${agentId}`;
    this.overlay.querySelector(`[data-tag="${id}"]`)?.remove();
    if (!on || this.opts.mini) return;
    const actor = this.actors.get(agentId);
    if (!actor) return;
    const el = document.createElement("div");
    el.className = "ol-tag";
    el.dataset.tag = id;
    el.dataset.actor = agentId;
    const name = document.createElement("b");
    name.textContent = actor.a.name;
    el.append(name);
    if (actor.a.task?.title) { const t = document.createElement("span"); t.textContent = actor.a.task.title; el.append(t); }
    this.overlay.append(el);
    this.positionAt(el, actor.x, actor.y + 3, false);
  }

  private updateBubbles() {
    this.bubbles = this.bubbles.filter((b) => {
      if (this.now > b.until) { b.el.remove(); return false; }
      const actor = b.actorId ? this.actors.get(b.actorId) : null;
      if (!actor && !b.robot) { b.el.remove(); return false; }
      const x = actor ? actor.x : b.robot!.x;
      const y = (actor ? actor.y : b.robot!.y) - 27;
      this.positionAt(b.el, x, y, true);
      return true;
    });
    for (const el of this.overlay.querySelectorAll<HTMLDivElement>(".ol-tag")) {
      const actor = this.actors.get(el.dataset.actor ?? "");
      if (actor) this.positionAt(el, actor.x, actor.y + 3, false);
    }
  }

  private positionAt(el: HTMLElement, x: number, y: number, above: boolean) {
    // Keep bubbles inside the world frame: clamp the anchor so the centered box never spills out.
    const half = el.offsetWidth / 2 / this.zoom;
    x = Math.min(W - half - 2, Math.max(half + 2, x));
    if (above) y = Math.max(y, el.offsetHeight / this.zoom + 2);
    const px = Math.round(this.ox + x * this.zoom);
    const py = Math.round(this.oy + y * this.zoom);
    el.style.transform = `translate(${px}px, ${py}px) translate(-50%, ${above ? "-100%" : "0"})`;
  }
}

/** The lane beside the destination row; for the middle row, the lane nearest the walker. */
function laneFor(fromY: number, toY: number): number {
  if (toY < LANE_TOP) return LANE_TOP;
  if (toY > LANE_BOTTOM) return LANE_BOTTOM;
  return fromY > (LANE_TOP + LANE_BOTTOM) / 2 ? LANE_BOTTOM : LANE_TOP;
}

function modeFor(actor: Actor): Mode {
  switch (actor.place.zone) {
    case "site": return "work";
    case "atc": return "atc";
    case "altar": return "kneel";
    case "gone": return "gone";
    default: return "idle";
  }
}

/** The procedural attacks (the CC0 packs have no anvil drop, acid rain, piranhas, spikes or rats). */
function drawAttack(g: Graphics, actor: Actor, p: number) {
  const { x, y } = actor;
  const top = y - 30;
  switch (actor.death!.kind) {
    case "anvil": {
      const ay = top - 20 + Math.min(1, p * 1.3) * 26;
      g.rect(x - 6, ay, 12, 4).fill(C.ink); g.rect(x - 3, ay + 4, 6, 3).fill(C.ink); g.rect(x - 7, ay - 2, 4, 2).fill(C.slate);
      break;
    }
    case "acid":
      for (let i = 0; i < 4; i++) g.rect(x - 6 + i * 4, top + ((p * 40 + i * 9) % 28), 1, 3).fill(C.lime);
      break;
    case "piranha":
      g.rect(x - 9, y - 28 * p, 18, 28 * p).fill({ color: C.blue, alpha: 0.6 });
      for (let i = 0; i < 3; i++) g.rect(x - 7 + ((i * 7 + p * 30) % 14), y - 4 - i * 6 * p, 3, 2).fill(C.red);
      break;
    case "spikes":
      for (let i = 0; i < 5; i++) g.poly([x - 9 + i * 4, y, x - 7 + i * 4, y - 8 * Math.min(1, p * 2), x - 5 + i * 4, y]).fill(C.cloud);
      break;
    case "rats":
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const d = 18 * (1 - p); g.rect(x + Math.cos(a) * d - 2, y - 3 + Math.sin(a) * 4, 4, 2).fill(C.brown); }
      break;
    case "ceiling":
      g.rect(x - 9, top - 4, 18, Math.min(28, p * 32)).fill(C.slate);
      break;
    default:
      break; // fireball, poison, lightning and freeze use atlas effects
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
