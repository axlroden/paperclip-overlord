#!/usr/bin/env node
// PixelLab driver for the Overlord cast. Generations are scarce (trial: 40), so:
//   node pixellab.mjs plan            -> steps, cost, what is done, live balance. Spends nothing.
//   node pixellab.mjs run <step...>   -> runs ONLY the named steps, in order, after checking balance.
// A finished step is never re-run (state.json); every result is downloaded to out/<step>/.
// Key: $PIXELLAB_API_KEY, else the macOS keychain item "pixellab-api" / account "overlord".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const API = "https://api.pixellab.ai/v2";
const plan = JSON.parse(fs.readFileSync(path.join(DIR, "plan.json"), "utf8"));
const statePath = path.join(DIR, "state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
const save = () => fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

function key() {
  if (process.env.PIXELLAB_API_KEY) return process.env.PIXELLAB_API_KEY;
  return execFileSync("security", ["find-generic-password", "-s", "pixellab-api", "-a", "overlord", "-w"], { encoding: "utf8" }).trim();
}
const KEY = key();

async function api(method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
const balance = async () => (await api("GET", "/balance")).subscription?.generations ?? 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJob(id) {
  for (let i = 0; i < 180; i++) {
    const job = await api("GET", `/background-jobs/${id}`);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(`job ${id} failed: ${JSON.stringify(job.last_response).slice(0, 400)}`);
    await sleep(5000);
  }
  throw new Error(`job ${id} still running after 15 min; check it later with GET /background-jobs/${id}`);
}

async function waitCharacter(id) {
  for (let i = 0; i < 180; i++) {
    const c = await api("GET", `/characters/${id}`);
    if (c.status === "completed") return c;
    if (c.status === "failed") throw new Error(`character ${id} failed`);
    await sleep(5000);
  }
  throw new Error(`character ${id} still pending after 15 min`);
}

async function download(url, file) {
  const res = await fetch(url, { headers: url.startsWith(API) ? { Authorization: `Bearer ${KEY}` } : {} });
  if (!res.ok) throw new Error(`download ${url} -> ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function b64png(file) {
  return { type: "base64", base64: fs.readFileSync(path.resolve(DIR, file)).toString("base64") };
}

const charOf = (stepId) => {
  const id = state[stepId]?.character_id;
  if (!id) throw new Error(`step needs character from "${stepId}", which has not run yet`);
  return id;
};

const kinds = {
  async image(step, out) {
    const params = { ...step.params };
    if (params.color_image) params.color_image = b64png(params.color_image);
    const r = await api("POST", "/create-image-pixflux", params);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "0.png"), Buffer.from(r.image.base64, "base64"));
    return { usage: r.usage ?? null };
  },
  async character(step, out) {
    const r = await api("POST", "/create-character-v3", step.params);
    state[step.id] = { character_id: r.character_id, started: new Date().toISOString() };
    save();
    await waitJob(r.background_job_id);
    const c = await waitCharacter(r.character_id);
    for (const [dir, url] of Object.entries(c.rotation_urls ?? {})) await download(url, path.join(out, `${dir}.png`));
    return { character_id: r.character_id };
  },
  async animate(step, out) {
    const r = await api("POST", "/characters/animations", { ...step.params, character_id: charOf(step.character) });
    state[step.id] = { animation_group_id: r.animation_group_id, jobs: r.background_job_ids, started: new Date().toISOString() };
    save();
    for (const id of r.background_job_ids) await waitJob(id);
    await download(`${API}/characters/${charOf(step.character)}/zip`, path.join(out, "character.zip"));
    return { animation_group_id: r.animation_group_id };
  },
  async edit(step, out) {
    const r = await api("POST", "/edit-image-pixen", { ...step.params, image: b64png(step.params.image) });
    const job = await waitJob(r.background_job_id);
    const imgs = job.last_response?.images ?? (job.last_response?.image ? [job.last_response.image] : []);
    imgs.forEach((img, i) => {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, `${i}.png`), Buffer.from(img.base64, "base64"));
    });
    return { images: imgs.length };
  },
};

const [cmd, ...ids] = process.argv.slice(2);
if (cmd === "plan" || !cmd) {
  let todo = 0;
  for (const s of plan.steps) {
    const done = state[s.id]?.done;
    if (!done) todo += s.cost;
    console.log(`${done ? "done" : "    "}  ${String(s.cost).padStart(2)}  ${s.id.padEnd(24)} ${s.note ?? ""}`);
  }
  console.log(`\nremaining plan cost: ${todo}   balance: ${await balance()}`);
} else if (cmd === "run") {
  const steps = ids.map((id) => plan.steps.find((s) => s.id === id) ?? (() => { throw new Error(`unknown step ${id}`); })());
  for (const s of steps) {
    if (state[s.id]?.done) { console.log(`skip ${s.id}: already done`); continue; }
    const before = await balance();
    if (before < s.cost) throw new Error(`balance ${before} < cost ${s.cost} for ${s.id}; stopping`);
    console.log(`run ${s.id} (est ${s.cost}, balance ${before})`);
    const result = await kinds[s.kind](s, path.join(DIR, "out", s.id));
    const after = await balance();
    state[s.id] = { ...state[s.id], ...result, done: new Date().toISOString(), spent: before - after };
    save();
    console.log(`  done: spent ${before - after}, balance ${after}`);
  }
} else {
  console.error("usage: pixellab.mjs plan | run <step...>");
  process.exit(2);
}
