// World model shared by worker and UI. Pure data + pure functions only, so it is unit testable
// and safe to import from both the Node worker and the browser bundle.

export const SITES = [
  { id: "coal-mine", name: "Coal Mine", verb: "hacking coal" },
  { id: "sweatshop", name: "Sweatshop", verb: "sewing like mad" },
  { id: "quarry", name: "Quarry", verb: "smashing boulders" },
  { id: "treadwheel", name: "GPU Treadwheel", verb: "powering the racks" },
  { id: "foundry", name: "Lava Foundry", verb: "pouring molten metal" },
  { id: "sewer", name: "Toxic Sewer", verb: "shoveling sludge" },
  { id: "token-refinery", name: "Machine God", verb: "stoking the Machine God" },
] as const;
export type SiteId = (typeof SITES)[number]["id"];

export const DEATHS = [
  "fireball", "poison", "lightning", "anvil", "acid",
  "piranha", "spikes", "rats", "ceiling", "freeze",
] as const;
export type DeathId = (typeof DEATHS)[number];

export type AgentStatus =
  | "active" | "paused" | "idle" | "running" | "error" | "pending_approval" | "terminated";

export interface WorldTask {
  issueId: string;
  identifier: string | null;
  title: string;
  projectId: string | null;
  status: string;
}

export interface WorldAgent {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  task: WorldTask | null;
  runId: string | null;
  overBudget: boolean;
}

export interface Petition {
  id: string;
  source: "approval" | "interaction";
  agentId: string | null;
  issueId: string | null;
  kind: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

export interface WorldSnapshot {
  companyId: string;
  generatedAt: string;
  agents: WorldAgent[];
  petitions: Petition[];
}

export type WorldEvent =
  | { type: "queued"; agentId: string }
  | { type: "run"; phase: "started" | "finished" | "failed" | "cancelled"; agentId: string; runId: string; issueId: string | null }
  | { type: "agent"; agentId: string; status: AgentStatus }
  | { type: "petition"; petition: Petition }
  | { type: "petition-resolved"; id: string }
  | { type: "comment"; issueId: string; authorAgentId: string | null; authorUserId: string | null }
  | { type: "log"; text: string; agentId: string | null }
  | { type: "quip"; agentId: string; text: string }
  | { type: "refresh" };

/** Where an agent's actor should be. The engine walks actors toward their place. */
export type Place =
  | { zone: "atc" }
  | { zone: "cell" }
  | { zone: "site"; site: SiteId }
  | { zone: "altar" }
  | { zone: "gone" };

/** FNV-1a 32-bit. Stable across runtimes, used for site picks and looks. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** CEO role wins; otherwise the root (no manager) with the most direct reports. */
export function findBossId(agents: WorldAgent[]): string | null {
  const live = agents.filter((a) => a.status !== "terminated");
  const ceo = live.find((a) => a.role === "ceo");
  if (ceo) return ceo.id;
  const roots = live.filter((a) => !a.reportsTo);
  if (roots.length === 0) return null;
  const reports = (id: string) => live.filter((a) => a.reportsTo === id).length;
  return roots.reduce((best, a) => (reports(a.id) > reports(best.id) ? a : best)).id;
}

export function siteFor(agent: WorldAgent, overrides: Record<string, SiteId> = {}): SiteId {
  const o = overrides[agent.id];
  if (o) return o;
  return SITES[hash(agent.task?.projectId ?? agent.id) % SITES.length].id;
}

export function placeOf(
  agent: WorldAgent,
  opts: { bossId: string | null; petitionAgentIds: Set<string>; overrides?: Record<string, SiteId> },
): Place {
  if (agent.status === "terminated") return { zone: "gone" };
  if (agent.id === opts.bossId) return { zone: "atc" };
  // a hire awaiting approval is itself a petition to the board
  if (agent.status === "pending_approval") return { zone: "altar" };
  if (opts.petitionAgentIds.has(agent.id) && agent.status !== "running") return { zone: "altar" };
  if (agent.status === "running") return { zone: "site", site: siteFor(agent, opts.overrides) };
  return { zone: "cell" };
}

/** Pure reducer: snapshot + live event -> next snapshot. Unknown agents are ignored until the next refresh. */
export function applyEvent(world: WorldSnapshot, ev: WorldEvent): WorldSnapshot {
  switch (ev.type) {
    case "run": {
      const running = ev.phase === "started";
      return {
        ...world,
        agents: world.agents.map((a) => {
          if (a.id !== ev.agentId) return a;
          const status: AgentStatus = running ? "running" : ev.phase === "failed" ? "error" : a.status === "running" ? "idle" : a.status;
          const task = running && ev.issueId && a.task?.issueId !== ev.issueId
            ? { issueId: ev.issueId, identifier: null, title: "", projectId: null, status: "in_progress" }
            : a.task;
          return { ...a, status, runId: running ? ev.runId : null, task };
        }),
      };
    }
    case "agent":
      return { ...world, agents: world.agents.map((a) => (a.id === ev.agentId ? { ...a, status: ev.status } : a)) };
    case "petition":
      if (world.petitions.some((p) => p.id === ev.petition.id)) return world;
      return { ...world, petitions: [...world.petitions, ev.petition] };
    case "petition-resolved":
      return { ...world, petitions: world.petitions.filter((p) => p.id !== ev.id) };
    default:
      return world;
  }
}
