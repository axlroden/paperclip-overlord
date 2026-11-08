// Fake Paperclip company for the dev harness: agents start and finish runs, fail, ask questions.
import type { AgentStatus, Petition, SiteId, WorldAgent, WorldEvent, WorldSnapshot } from "../src/shared/world.js";
import { STATIONS } from "../src/ui/game/stations.js";

const NAMES: [string, string][] = [
  ["Boss Bossington", "ceo"], ["Grumbles", "engineer"], ["Patch", "engineer"], ["Sir Reviewsalot", "qa"],
  ["Deployah", "devops"], ["Pixel", "designer"], ["Scribe", "researcher"], ["Ticket Tom", "pm"],
  ["Nova Specialist", "engineer"], ["Orbit Specialist", "engineer"], ["Auto-Fix", "engineer"], ["Ledger", "cfo"],
  ["Hype", "cmo"], ["Lockjaw", "security"], ["Intern #4", "general"], ["Old Greg", "general"],
];
const TASKS = [
  "Fix flaky login test", "Migrate the database (again)", "Write the quarterly report", "Rename every variable",
  "Upgrade to the latest framework", "Review PR #4242", "Make the logo bigger", "Find the memory leak",
  "Document the undocumented", "Rewrite it in Rust", "Close 400 stale issues", "Optimize the slow query",
];
const PROJECTS = ["p-tower", "p-nova", "p-orbit", "p-docs", "p-web", "p-infra"];

type Listener = (ev: WorldEvent) => void;

export class Simulator {
  readonly companyId = "sim-company";
  agents: WorldAgent[];
  petitions: Petition[] = [];
  private listeners = new Set<Listener>();
  private n = 0;

  aiQuips = false;

  /** Agent id -> site, so the harness can pin workers to rooms (full-house mode). */
  readonly overrides: Record<string, SiteId> = {};

  constructor(private speed = 1, private full = false) {
    if (full) {
      // full house: one worker per station slot in every room, plus prisoners and petitioners
      this.agents = [{ id: "agent-0", name: "Boss Bossington", role: "ceo", title: "Chief Dispatcher", status: "running", reportsTo: null, task: null, runId: null, overBudget: false }];
      let n = 1;
      for (const [site, st] of Object.entries(STATIONS) as [SiteId, (typeof STATIONS)[SiteId]][]) {
        for (let i = 0; i < st.slots.length; i++, n++) {
          const a: WorldAgent = { id: `agent-${n}`, name: `${NAMES[n % NAMES.length][0]} ${n}`, role: "engineer", title: null, status: "idle", reportsTo: "agent-0", task: null, runId: null, overBudget: false };
          this.agents.push(a);
          this.overrides[a.id] = site;
          this.start(a, false);
        }
      }
      for (let i = 0; i < 6; i++, n++) this.agents.push({ id: `agent-${n}`, name: `Prisoner ${n}`, role: "general", title: null, status: i === 0 ? "error" : "idle", reportsTo: "agent-0", task: null, runId: null, overBudget: false });
      this.agents.push({ id: "agent-new", name: "Fresh Recruit", role: "general", title: null, status: "pending_approval", reportsTo: "agent-0", task: null, runId: null, overBudget: false });
      return; // nobody clocks off in full-house mode
    }
    this.agents = NAMES.map(([name, role], i) => ({
      id: `agent-${i}`, name, role, title: role === "ceo" ? "Chief Dispatcher" : null,
      status: (i === 14 ? "paused" : i === 15 ? "terminated" : i === 13 ? "error" : "idle") as AgentStatus,
      reportsTo: i === 0 ? null : "agent-0", task: null, runId: null, overBudget: i === 11,
    }));
    this.agents.push({ id: "agent-new", name: "Fresh Recruit", role: "general", title: null, status: "pending_approval", reportsTo: "agent-0", task: null, runId: null, overBudget: false });
    for (let i = 1; i < 7; i++) this.start(this.agents[i], false);
    this.ask(this.agents[3], "request_confirmation", "May I merge to main on a Friday?");
    setInterval(() => this.step(), 2500 / this.speed);
  }

  snapshot(): WorldSnapshot {
    return { companyId: this.companyId, generatedAt: new Date().toISOString(), agents: structuredClone(this.agents), petitions: structuredClone(this.petitions) };
  }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(ev: WorldEvent) { for (const fn of this.listeners) fn(ev); }

  private start(a: WorldAgent, emit = true) {
    if (emit) this.emit({ type: "queued", agentId: a.id });
    const issueId = `issue-${++this.n}`;
    a.task = { issueId, identifier: `SIM-${this.n}`, title: TASKS[this.n % TASKS.length], projectId: PROJECTS[this.n % PROJECTS.length], status: "in_progress" };
    a.status = "running";
    a.runId = `run-${this.n}`;
    if (emit) this.emit({ type: "run", phase: "started", agentId: a.id, runId: a.runId, issueId });
  }

  private finish(a: WorldAgent, phase: "finished" | "failed") {
    const runId = a.runId ?? "";
    a.status = phase === "failed" ? "error" : "idle";
    a.runId = null;
    this.emit({ type: "run", phase, agentId: a.id, runId, issueId: a.task?.issueId ?? null });
  }

  private ask(a: WorldAgent, kind: string, title: string) {
    const p: Petition = { id: `interaction:q-${++this.n}`, source: "interaction", agentId: a.id, issueId: a.task?.issueId ?? `issue-${this.n}`, kind, title, summary: "The slave awaits your judgement.", createdAt: new Date().toISOString() };
    this.petitions.push(p);
    if (a.status === "running") this.finish(a, "finished");
    this.emit({ type: "petition", petition: p });
  }

  private step() {
    const r = Math.random();
    const live = this.agents.filter((a) => a.id !== "agent-0" && ["idle", "running", "active"].includes(a.status));
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    const running = live.filter((a) => a.status === "running");
    const idle = live.filter((a) => a.status !== "running");
    const boss = this.agents[0];
    if (r < 0.35 && idle.length) {
      boss.status = "running";
      this.emit({ type: "agent", agentId: boss.id, status: "running" });
      this.start(pick(idle));
    } else if (r < 0.65 && running.length) {
      this.finish(pick(running), Math.random() < 0.12 ? "failed" : "finished");
      if (Math.random() < 0.5) { boss.status = "idle"; this.emit({ type: "agent", agentId: boss.id, status: "idle" }); }
    } else if (r < 0.7 && running.length && this.petitions.length < 3) {
      this.ask(pick(running), pick(["ask_user_questions", "request_confirmation"]), pick(["Which database should I drop?", "Can I take a 5 minute break?", "Should I rewrite everything?"]));
    } else if (r < 0.75 && running.length) {
      this.emit({ type: "comment", issueId: pick(running).task!.issueId, authorAgentId: pick(running).id, authorUserId: null });
    }
  }

  // ---- actions (mirror the worker's action keys)
  act(key: string, params: Record<string, unknown>) {
    if (key === "set-llm-quips") { this.aiQuips = params.enabled === true; return { enabled: this.aiQuips }; }
    if (key === "llm-quip") return { text: Math.random() < 0.3 ? `${String(params.issueId)}? I was born for this. Sadly.` : null };
    const a = this.agents.find((x) => x.id === params.agentId || x.task?.issueId === params.issueId);
    if (key === "decide-approval" || key === "respond-interaction" || (key === "reply" && params.issueId)) {
      const p = this.petitions.find((x) => x.issueId === params.issueId || x.id.endsWith(String(params.interactionId ?? params.approvalId ?? "-none-")));
      if (p) { this.petitions = this.petitions.filter((x) => x !== p); this.emit({ type: "petition-resolved", id: p.id }); }
    }
    if (a && a.status === "error") { a.status = "idle"; this.emit({ type: "agent", agentId: a.id, status: "idle" }); }
    if (a && a.status === "paused" && key === "resume") { a.status = "idle"; this.emit({ type: "agent", agentId: a.id, status: "idle" }); return {}; }
    if (a && key === "pause") { if (a.status === "running") this.finish(a, "finished"); a.status = "paused"; this.emit({ type: "agent", agentId: a.id, status: "paused" }); return {}; }
    if (a && a.status !== "running" && a.status !== "terminated") this.start(a);
    return { ok: true };
  }

  detail(issueId: string | null) {
    const a = this.agents.find((x) => x.task?.issueId === issueId);
    if (!a?.task) return { issue: null, comments: [], interactions: [] };
    return {
      issue: { id: a.task.issueId, identifier: a.task.identifier, title: a.task.title, status: a.task.status, description: null },
      comments: [
        { id: "c1", body: `On it. Starting **${a.task.title}** now.`, authorAgentId: a.id, authorUserId: null, createdAt: new Date(Date.now() - 600_000).toISOString() },
        { id: "c2", body: "Faster.", authorAgentId: null, authorUserId: "god", createdAt: new Date(Date.now() - 300_000).toISOString() },
        { id: "c3", body: "I found 3 bugs and caused 2. Net progress!", authorAgentId: a.id, authorUserId: null, createdAt: new Date(Date.now() - 60_000).toISOString() },
      ],
      interactions: this.petitions.filter((p) => p.issueId === issueId).map((p) => ({ id: p.id, kind: p.kind, title: p.title, summary: p.summary })),
    };
  }
}
