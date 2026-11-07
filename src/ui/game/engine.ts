import { Application, Container, Graphics, Sprite } from "pixi.js";
import {
  DEATHS, findBossId, placeOf,
  type DeathId, type Place, type SiteId, type WorldAgent, type WorldEvent, type WorldSnapshot,
} from "../../shared/world.js";
import { C, character, ghost, godHand, lookFor, plane, remains, robot, tomb, type Look, type Pose } from "./pixels.js";
import {
  ALTAR, ATC, ATC_DESK, background, cellBars, cellFeet, GRAVE, H, LANE_BOTTOM, LANE_TOP, PRISON,
  SITE_BOXES, slotIn, STOCKS, TICKER_Y, W, WAGON,
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

type Mode = "walk" | "work" | "idle" | "kneel" | "stocks" | "atc" | "tomb" | "wagon";

interface Death { kind: DeathId; t: number }

interface Actor {
  a: WorldAgent;
  look: Look;
  sprite: Sprite;
  x: number; y: number;
  path: { x: number; y: number }[];
  place: Place;
  mode: Mode;
  sprintUntil: number;
  hurtUntil: number;
  nextDeath: number;
  death: Death | null;
}

interface Bubble { el: HTMLDivElement; until: number; actorId: string | null; robot: Robot | null }
interface Robot { sprite: Sprite; x: number; y: number; tx: number; ty: number; victim: string | null; strikeUntil: number; cooldownUntil: number; zap: boolean }
interface Fx { kind: "plane" | "hand" | "crack" | "flash" | "puff"; t: number; dur: number; x: number; y: number; x2?: number; y2?: number; sprite?: Sprite; target?: string; hit?: string }

const REMAINS: Record<DeathId, Parameters<typeof remains>[0]> = {
  fireball: "charred", poison: "skeleton", lightning: "skeleton", anvil: "flat", acid: "puddle",
  piranha: "bones", spikes: "skeleton", rats: "bones", ceiling: "flat", freeze: "ice",
};
const ATTACK_MS = 900;
const REMAINS_MS = 2000;
const GHOST_MS = 1300;
const DEATH_MS = ATTACK_MS + REMAINS_MS + GHOST_MS;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export class OverlordEngine {
  private app = new Application();
  private world = new Container();
  private actorsLayer = new Container();
  private fxLayer = new Container();
  private fxG = new Graphics();
  private night = new Graphics();
  private backdrop = new Graphics(); // screen space: sky, grass and ticker bar continue past the world edges
  private overlay: HTMLDivElement;
  private actors = new Map<string, Actor>();
  private robots: Robot[] = [];
  private fx: Fx[] = [];
  private bubbles: Bubble[] = [];
  private snapshot: WorldSnapshot | null = null;
  private bossId: string | null = null;
  private now = 0;
  private nextChatter = 2000;
  private zoom = 1;
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
    // Device-pixel resolution: zoom then snaps to whole DEVICE pixels (2x, 3x on a 2x screen = 1, 1.5 CSS),
    // which stays pixel-perfect while using far more of the frame than whole CSS-pixel steps.
    // shortcut: resolution is fixed at mount; moving the tab to a screen with another DPR needs a remount.
    await e.app.init({ backgroundAlpha: 0, antialias: false, roundPixels: true, resolution: window.devicePixelRatio || 1, autoDensity: true, resizeTo: host, preference: "webgl" });
    if (e.destroyed) { e.app.destroy(true); return e; }
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
    try { this.app.destroy(true, { children: true }); } catch { /* init may not have finished */ }
  }

  private build() {
    this.app.stage.addChild(this.backdrop, this.world);
    this.world.addChild(new Sprite(background()));
    this.actorsLayer.sortableChildren = true;
    this.world.addChild(this.actorsLayer);
    const bars = new Sprite(cellBars());
    bars.position.set(PRISON.x, PRISON.y);
    bars.zIndex = 0;
    this.world.addChild(bars);
    this.world.addChild(this.fxLayer, this.fxG, this.night);
  }

  private fit() {
    const dpr = this.app.renderer.resolution;
    const w = this.host.clientWidth || W;
    const h = this.host.clientHeight || H;
    const s = Math.min((w * dpr) / W, (h * dpr) / H);
    this.zoom = (s >= 1 ? Math.floor(s) : s) / dpr;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    this.ox = snap((w - W * this.zoom) / 2);
    this.oy = snap((h - H * this.zoom) / 2);
    this.world.scale.set(this.zoom);
    this.world.position.set(this.ox, this.oy);
    const z = this.zoom;
    this.backdrop.clear()
      .rect(0, 0, w, this.oy + 24 * z).fill(C.sky)
      .rect(0, this.oy + 24 * z, w, 10 * z).fill(C.cloud)
      .rect(0, this.oy + 34 * z, w, h).fill(C.moss)
      .rect(0, this.oy + TICKER_Y * z, w, (H - TICKER_Y) * z).fill(C.ink);
    this.overlay.style.setProperty("--ol-zoom", String(z));
    // HTML chrome (ticker, HUD) hugs the drawn world rather than the stage.
    for (const [k, v] of [["--ol-wx", this.ox], ["--ol-wy", this.oy], ["--ol-ww", W * z], ["--ol-wh", H * z]] as const) {
      this.host.style.setProperty(k, `${v}px`);
    }
    this.host.style.setProperty("--ol-zoom", String(z));
  }

  // ---------------------------------------------------------------- state

  setWorld(snap: WorldSnapshot) {
    this.snapshot = snap;
    this.bossId = findBossId(snap.agents);
    const petitionAgents = new Set(snap.petitions.map((p) => p.agentId).filter((x): x is string => !!x));
    const seen = new Set<string>();
    const counters = new Map<string, number>();
    const slot = (key: string) => { const n = counters.get(key) ?? 0; counters.set(key, n + 1); return n; };
    let cell = 0;

    for (const a of [...snap.agents].sort((x, y) => x.name.localeCompare(y.name))) {
      seen.add(a.id);
      let actor = this.actors.get(a.id);
      if (!actor) actor = this.spawn(a);
      const before = actor.a.status;
      actor.a = a;
      const place = placeOf(a, { bossId: this.bossId, petitionAgentIds: petitionAgents, overrides: this.opts.overrides });
      const cellIndex = a.id === this.bossId || a.status === "terminated" ? -1 : cell++;
      const target = this.targetFor(place, cellIndex, slot);
      const moved = place.zone !== actor.place.zone || (place.zone === "site" && actor.place.zone === "site" && place.site !== actor.place.site);
      actor.place = place;
      if (moved && actor.death) this.revive(actor);
      if (moved || actor.path.length === 0) this.route(actor, target);
      actor.sprite.alpha = a.status === "paused" ? 0.75 : 1;
      if (before !== "running" && a.status === "running" && place.zone === "site") this.dispatch(actor);
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
      if (actor) this.addPlane(actor.x, actor.y - 20, 240, 20);
    }
    if (ev.type === "run" && ev.phase === "failed") this.say(ev.agentId, this.opts.quip("stocks", this.actors.get(ev.agentId)?.a ?? null));
    if (ev.type === "run" && ev.phase === "finished" && Math.random() < 0.5) this.say(ev.agentId, this.opts.quip("returning", this.actors.get(ev.agentId)?.a ?? null));
    if (ev.type === "queued") {
      const actor = this.actors.get(ev.agentId);
      if (actor && ev.agentId !== this.bossId) this.addPlane(ATC.x + 50, ATC.y + 30, actor.x, actor.y - 16);
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
    this.fx.push({ kind: "hand", t: 0, dur: 1300, x: actor.x, y: actor.y - 24, sprite, target: agentId });
  }

  say(agentId: string, text: string | null) {
    if (!text) return;
    const actor = this.actors.get(agentId);
    if (!actor) return;
    this.bubble(text, actor.a.id, null);
  }

  // ---------------------------------------------------------------- placement

  private spawn(a: WorldAgent): Actor {
    const look = lookFor(a.id, a.role);
    const sprite = new Sprite(character(look, "stand"));
    sprite.anchor.set(0.5, 1);
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.on("pointertap", () => this.opts.onSelect?.(a.id));
    sprite.on("pointerover", () => this.hoverTag(a.id, true));
    sprite.on("pointerout", () => this.hoverTag(a.id, false));
    this.actorsLayer.addChild(sprite);
    const start = { x: WAGON.x + 30, y: WAGON.y + 36 };
    const actor: Actor = {
      a, look, sprite, x: start.x, y: start.y, path: [], place: { zone: "wagon" }, mode: "idle",
      sprintUntil: 0, hurtUntil: 0, nextDeath: this.now + this.deathDelay(), death: null,
    };
    this.actors.set(a.id, actor);
    return actor;
  }

  private targetFor(place: Place, cellIndex: number, slot: (key: string) => number): { x: number; y: number } {
    switch (place.zone) {
      case "atc": return { ...ATC_DESK };
      case "cell": return cellFeet(Math.max(0, cellIndex));
      case "site": return slotIn(SITE_BOXES[place.site], slot(`site:${place.site}`), 13, 5);
      case "altar": return slotIn(ALTAR, slot("altar"), 10, 6);
      case "stocks": { const i = slot("stocks"); return { x: STOCKS.x + 7 + (i % 4) * 17, y: STOCKS.y + 36 }; }
      case "wagon": return slotIn({ ...WAGON, y: WAGON.y - 8 }, slot("wagon"), 9, 4);
      case "graveyard": return slotIn(GRAVE, slot("grave"), 14, 4);
    }
  }

  /** Walk via the nearest lane: up/down to the lane, along it, then to the target. */
  private route(actor: Actor, to: { x: number; y: number }) {
    if (actor.place.zone === "graveyard") { actor.x = to.x; actor.y = to.y; actor.path = []; return; }
    if (actor.death) { actor.path = []; return; } // finishes dying in place; setWorld routes it after
    const lane = (actor.y > 140 || to.y > 140) && !(actor.y < 100 && to.y < 100) ? LANE_BOTTOM : LANE_TOP;
    const laneX = (x: number) => (x < 94 ? 94 : x);
    actor.path = Math.abs(actor.x - to.x) < 2 && Math.abs(actor.y - to.y) < 30
      ? [to]
      : [{ x: actor.x, y: lane }, { x: laneX(to.x), y: lane }, { x: to.x, y: lane }, to];
  }

  private deathDelay() {
    const [a, b] = this.opts.deathEveryMs ?? [30_000, 120_000];
    return rand(a, b);
  }

  private dispatch(actor: Actor) {
    if (Math.random() < 0.6) this.say(actor.a.id, this.opts.quip("dispatched", actor.a));
  }

  private addPlane(x: number, y: number, x2: number, y2: number) {
    if (this.opts.mini) return;
    const sprite = new Sprite(plane());
    sprite.anchor.set(0.5);
    this.fxLayer.addChild(sprite);
    this.fx.push({ kind: "plane", t: 0, dur: 1100, x, y, x2, y2, sprite });
  }

  private syncRobots() {
    const running = [...this.actors.values()].filter((a) => a.place.zone === "site").length;
    const want = Math.max(1, Math.min(8, Math.ceil(running / 2)));
    while (this.robots.length < want) {
      const sprite = new Sprite(robot("walk0"));
      sprite.anchor.set(0.5, 1);
      this.actorsLayer.addChild(sprite);
      const x = 120 + Math.random() * 200;
      this.robots.push({ sprite, x, y: LANE_BOTTOM, tx: x, ty: LANE_BOTTOM, victim: null, strikeUntil: 0, cooldownUntil: 0, zap: false });
    }
    while (this.robots.length > want) this.robots.pop()!.sprite.destroy();
  }

  // ---------------------------------------------------------------- loop

  private tick(dt: number) {
    this.now += dt;
    for (const actor of this.actors.values()) this.updateActor(actor, dt);
    for (const r of this.robots) this.updateRobot(r, dt);
    this.updateFx(dt);
    this.updateBubbles();
    this.chatter();
    this.updateNight();
  }

  private updateActor(actor: Actor, dt: number) {
    const frame = Math.floor(this.now / 125);
    if (actor.death) { this.updateDeath(actor); return; }
    const sprint = this.now < actor.sprintUntil;
    if (actor.path.length) {
      const target = actor.path[0];
      const speed = (sprint ? 90 : 34) * (dt / 1000);
      const dx = target.x - actor.x;
      const dy = target.y - actor.y;
      const d = Math.hypot(dx, dy);
      if (d <= speed) { actor.x = target.x; actor.y = target.y; actor.path.shift(); }
      else { actor.x += (dx / d) * speed; actor.y += (dy / d) * speed; }
      actor.mode = "walk";
      actor.sprite.scale.x = dx < 0 ? -1 : 1;
    } else {
      actor.mode = modeFor(actor);
      actor.sprite.scale.x = 1;
    }

    const hurt = this.now < actor.hurtUntil;
    let pose: Pose = "stand";
    const site = actor.place.zone === "site" ? actor.place.site : null;
    switch (actor.mode) {
      case "walk": pose = (["walk0", "walk1", "walk2", "walk3"] as const)[frame % 4]; break;
      case "work": pose = site === "treadwheel" ? (["walk0", "walk1", "walk2", "walk3"] as const)[frame % 4] : frame % (sprint ? 2 : 4) < (sprint ? 1 : 2) ? "work0" : "work1"; break;
      case "kneel": pose = "kneel"; break;
      case "stocks": pose = "stocks"; break;
      case "atc": pose = actor.a.status === "running" ? (frame % 2 ? "work0" : "work1") : "sit"; break;
      case "wagon": pose = "stand"; break;
      default: pose = "stand";
    }
    if (hurt) pose = "hurt";
    actor.sprite.texture = actor.mode === "tomb" ? tomb() : character(actor.look, pose, site);
    const jitter = (actor.mode === "atc" && actor.a.status === "running") || hurt ? (frame % 2) - 0.5 : 0;
    actor.sprite.position.set(Math.round(actor.x + jitter), Math.round(actor.y));
    actor.sprite.zIndex = actor.y;

    if (actor.mode === "idle" && actor.place.zone === "cell" && this.now > actor.nextDeath && !this.opts.mini) {
      actor.death = { kind: pick(DEATHS), t: this.now };
      if (Math.random() < 0.8) this.say(actor.a.id, this.opts.quip(`death:${actor.death.kind}`, actor.a));
    }
  }

  private updateDeath(actor: Actor) {
    const d = actor.death!;
    const t = this.now - d.t;
    const s = actor.sprite;
    s.position.set(Math.round(actor.x), Math.round(actor.y));
    if (t < ATTACK_MS) {
      const flicker = d.kind === "lightning" && Math.floor(t / 80) % 2 === 0;
      s.texture = flicker ? remains("skeleton", actor.look) : character(actor.look, "hurt");
      s.tint = d.kind === "freeze" ? 0x9ee7ff : d.kind === "poison" ? 0xb0ff90 : 0xffffff;
    } else if (t < ATTACK_MS + REMAINS_MS) {
      s.tint = 0xffffff;
      s.texture = remains(REMAINS[d.kind], actor.look);
    } else if (t < DEATH_MS) {
      s.texture = ghost();
      s.alpha = 1 - (t - ATTACK_MS - REMAINS_MS) / GHOST_MS;
      s.position.set(Math.round(actor.x), Math.round(actor.y - ((t - ATTACK_MS - REMAINS_MS) / GHOST_MS) * 30));
    } else {
      this.revive(actor);
      if (Math.random() < 0.5) this.say(actor.a.id, this.opts.quip("respawn", actor.a));
    }
  }

  /** End a cruelty early or on schedule: back to a whole, living (for now) slave. */
  private revive(actor: Actor) {
    actor.death = null;
    actor.sprite.alpha = actor.a.status === "paused" ? 0.75 : 1;
    actor.sprite.tint = 0xffffff;
    actor.nextDeath = this.now + this.deathDelay();
    this.fx.push({ kind: "puff", t: 0, dur: 400, x: actor.x, y: actor.y - 8 });
  }

  private updateRobot(r: Robot, dt: number) {
    const workers = [...this.actors.values()].filter((a) => a.mode === "work" && a.place.zone === "site" && !a.death);
    if (this.now < r.strikeUntil) {
      r.sprite.texture = robot(r.zap ? "zap" : "whip");
      return;
    }
    if (r.victim && this.now >= r.cooldownUntil) {
      const v = this.actors.get(r.victim);
      if (v && Math.hypot(v.x - r.x, v.y - r.y) < 14) {
        r.zap = Math.random() < 0.4;
        r.strikeUntil = this.now + 500;
        r.cooldownUntil = this.now + rand(2500, 7000);
        v.hurtUntil = this.now + 350;
        this.fx.push({ kind: r.zap ? "flash" : "crack", t: 0, dur: 300, x: r.x + 6, y: r.y - 16, x2: v.x, y2: v.y - 12 });
        if (Math.random() < 0.45) this.say(v.a.id, this.opts.quip(r.zap ? "zapped" : "whipped", v.a));
        else if (Math.random() < 0.2) this.bubble(this.opts.quip("robot", null), null, r);
        r.victim = null;
        return;
      }
    }
    if (!r.victim && this.now >= r.cooldownUntil) {
      const v = workers.length ? pick(workers) : null;
      if (v) { r.victim = v.a.id; }
      else { r.tx = rand(110, 330); r.ty = Math.random() < 0.5 ? LANE_TOP : LANE_BOTTOM; r.cooldownUntil = this.now + rand(2000, 5000); }
    }
    if (r.victim) { const v = this.actors.get(r.victim); if (v) { r.tx = v.x - 10; r.ty = v.y; } else r.victim = null; }
    const dx = r.tx - r.x;
    const dy = r.ty - r.y;
    const d = Math.hypot(dx, dy);
    const step = 40 * (dt / 1000);
    if (d > step) { r.x += (dx / d) * step; r.y += (dy / d) * step; r.sprite.scale.x = dx < 0 ? -1 : 1; }
    r.sprite.texture = robot(d > step && Math.floor(this.now / 150) % 2 ? "walk1" : "walk0");
    r.sprite.position.set(Math.round(r.x), Math.round(r.y));
    r.sprite.zIndex = r.y;
  }

  private updateFx(dt: number) {
    const g = this.fxG;
    g.clear();
    for (const actor of this.actors.values()) if (actor.death && this.now - actor.death.t < ATTACK_MS) drawAttack(g, actor, (this.now - actor.death.t) / ATTACK_MS);
    for (const f of this.fx) {
      f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      if (f.kind === "plane" && f.sprite) {
        f.sprite.position.set(f.x + (f.x2! - f.x) * p, f.y + (f.y2! - f.y) * p - Math.sin(p * Math.PI) * 20);
        f.sprite.scale.x = f.x2! < f.x ? -1 : 1;
      } else if (f.kind === "hand" && f.sprite) {
        const down = easeOut(Math.min(1, f.t / 450));
        const up = Math.max(0, (f.t - 900) / 400);
        const handY = Math.round(-10 + (f.y + 10) * down - (f.y + 50) * up);
        const hx = Math.round(f.x - 10);
        f.sprite.position.set(hx, handY);
        const striking = f.t > 450 && f.t < 900;
        f.sprite.texture = godHand(!striking);
        // Robed arm reaching down from the clouds.
        const top = 26;
        const sleeveBottom = handY - 38;
        if (sleeveBottom > top) {
          g.rect(hx - 6, top, 12, sleeveBottom - top).fill(C.white);
          g.rect(hx - 6, top, 2, sleeveBottom - top).fill(C.cloud);
          g.rect(hx - 6, sleeveBottom - 3, 12, 2).fill(C.gold);
        }
        g.circle(hx, top + 2, 10 + Math.sin(f.t / 60) * 2).fill({ color: C.yellow, alpha: 0.35 });
        if (striking) {
          const target = f.target ? this.actors.get(f.target) : this.actors.get(f.hit ?? "");
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
            this.world.position.set(this.ox + (Math.floor(f.t / 40) % 2 ? this.zoom : -this.zoom), this.oy);
          } else this.world.position.set(this.ox, this.oy);
        } else if (f.t >= 900 && f.t < 960) this.world.position.set(this.ox, this.oy);
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
      } else if (f.kind === "crack") {
        g.moveTo(f.x, f.y).quadraticCurveTo((f.x + f.x2!) / 2, f.y - 10, f.x2!, f.y2!).stroke({ width: 1, color: C.brown });
        if (p > 0.5) g.rect(f.x2! - 2, f.y2! - 2, 5, 5).fill({ color: C.white, alpha: 1 - p });
      } else if (f.kind === "flash") {
        let x = f.x; let y = f.y;
        g.moveTo(x, y);
        for (let i = 1; i <= 4; i++) { x = f.x + ((f.x2! - f.x) * i) / 4 + (i % 2 ? 3 : -3); y = f.y + ((f.y2! - f.y) * i) / 4; g.lineTo(x, y); }
        g.stroke({ width: 1, color: C.yellow, alpha: 1 - p });
      } else if (f.kind === "puff") {
        g.circle(f.x, f.y, 3 + p * 8).fill({ color: C.white, alpha: 0.8 * (1 - p) });
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.t < f.dur) return true;
      f.sprite?.destroy();
      return false;
    });
  }

  private updateNight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const dark = h >= 20 || h < 6 ? 0.35 : h >= 18 ? (h - 18) * 0.17 : h < 7 ? (7 - h) * 0.35 : 0;
    this.night.clear();
    if (dark > 0) this.night.rect(0, 34, W, H - 34 - 30).fill({ color: C.night, alpha: dark });
  }

  // ---------------------------------------------------------------- bubbles

  private chatter() {
    if (this.now < this.nextChatter) return;
    this.nextChatter = this.now + (this.opts.mini ? rand(8000, 14000) : rand(2500, 6000));
    const pool = [...this.actors.values()].filter((a) => !a.death && a.mode !== "tomb" && a.mode !== "walk");
    if (!pool.length) return;
    const actor = pick(pool);
    const tag = actor.mode === "atc" ? "atc"
      : actor.place.zone === "site" ? `site:${actor.place.site}`
        : actor.place.zone === "stocks" ? "stocks"
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
    el.innerHTML = "";
    const name = document.createElement("b");
    name.textContent = actor.a.name;
    el.append(name);
    if (actor.a.task?.title) { const t = document.createElement("span"); t.textContent = actor.a.task.title; el.append(t); }
    this.overlay.append(el);
    this.positionAt(el, actor.x, actor.y + 4, false);
  }

  private updateBubbles() {
    this.bubbles = this.bubbles.filter((b) => {
      if (this.now > b.until) { b.el.remove(); return false; }
      const actor = b.actorId ? this.actors.get(b.actorId) : null;
      const x = actor ? actor.x : b.robot?.x ?? 0;
      const y = actor ? (actor.death ? actor.sprite.y : actor.y) - 26 : (b.robot?.y ?? 0) - 26;
      if (!actor && !b.robot) { b.el.remove(); return false; }
      this.positionAt(b.el, x, y, true);
      return true;
    });
    for (const el of this.overlay.querySelectorAll<HTMLDivElement>(".ol-tag")) {
      const actor = this.actors.get(el.dataset.actor ?? "");
      if (actor) this.positionAt(el, actor.x, actor.y + 4, false);
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

function modeFor(actor: Actor): Mode {
  switch (actor.place.zone) {
    case "site": return "work";
    case "atc": return "atc";
    case "altar": return "kneel";
    case "stocks": return "stocks";
    case "graveyard": return "tomb";
    case "wagon": return "wagon";
    default: return "idle";
  }
}

function drawAttack(g: Graphics, actor: Actor, p: number) {
  const { x, y } = actor;
  const kind = actor.death!.kind;
  const top = y - 26;
  switch (kind) {
    case "fireball": {
      const fx = x - 40 + 40 * p;
      g.circle(fx, y - 12, 4).fill(C.orange); g.circle(fx, y - 12, 2).fill(C.yellow);
      g.rect(fx - 10, y - 13, 6, 2).fill({ color: C.red, alpha: 0.7 });
      if (p > 0.8) g.circle(x, y - 12, 9 * (p - 0.8) * 5).fill({ color: C.orange, alpha: 0.6 });
      break;
    }
    case "poison":
      for (let i = 0; i < 6; i++) g.circle(x + Math.cos(i + p * 6) * (4 + p * 6), y - 10 + Math.sin(i * 2) * 5, 2 + p * 2).fill({ color: C.lime, alpha: 0.6 });
      break;
    case "lightning": {
      if (p < 0.5) break;
      let lx = x; g.moveTo(lx, top - 30);
      for (let i = 1; i <= 5; i++) { lx = x + (i % 2 ? 4 : -4); g.lineTo(lx, top - 30 + i * 8); }
      g.stroke({ width: 2, color: C.yellow });
      break;
    }
    case "anvil": {
      const ay = top - 30 + Math.min(1, p * 1.3) * 34;
      g.rect(x - 6, ay, 12, 4).fill(C.ink); g.rect(x - 3, ay + 4, 6, 3).fill(C.ink); g.rect(x - 7, ay - 2, 4, 2).fill(C.slate);
      break;
    }
    case "acid":
      for (let i = 0; i < 4; i++) g.rect(x - 6 + i * 4, top - 2 + ((p * 40 + i * 9) % 26), 1, 3).fill(C.lime);
      break;
    case "piranha":
      g.rect(x - 10, y - 26 * p, 20, 26 * p).fill({ color: C.blue, alpha: 0.6 });
      for (let i = 0; i < 3; i++) g.rect(x - 8 + ((i * 7 + p * 30) % 16), y - 4 - i * 6 * p, 3, 2).fill(C.red);
      break;
    case "spikes":
      for (let i = 0; i < 5; i++) g.poly([x - 9 + i * 4, y, x - 7 + i * 4, y - 8 * Math.min(1, p * 2), x - 5 + i * 4, y]).fill(C.cloud);
      break;
    case "rats":
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const d = 20 * (1 - p); g.rect(x + Math.cos(a) * d - 2, y - 3 + Math.sin(a) * 4, 4, 2).fill(C.brown); }
      break;
    case "ceiling":
      g.rect(x - 10, top - 2, 20, Math.min(24, p * 30)).fill(C.slate);
      break;
    case "freeze":
      g.rect(x - 40 + 30 * Math.min(1, p * 2), y - 12, 30, 2).fill({ color: C.ice, alpha: 0.9 });
      break;
  }
}
