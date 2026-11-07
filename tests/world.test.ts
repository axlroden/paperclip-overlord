import { describe, expect, it } from "vitest";
import { applyEvent, findBossId, hash, placeOf, SITES, siteFor, type WorldAgent, type WorldSnapshot } from "../src/shared/world.js";

const agent = (id: string, over: Partial<WorldAgent> = {}): WorldAgent => ({
  id, name: id, role: "engineer", title: null, status: "idle", reportsTo: "boss", task: null, runId: null, overBudget: false, ...over,
});
const world = (agents: WorldAgent[]): WorldSnapshot => ({ companyId: "c", generatedAt: "", agents, petitions: [] });
const place = (a: WorldAgent, petitioners: string[] = [], bossId = "boss") => placeOf(a, { bossId, petitionAgentIds: new Set(petitioners) });

describe("findBossId", () => {
  it("prefers the ceo role", () => {
    expect(findBossId([agent("a", { reportsTo: null }), agent("ceo", { role: "ceo" })])).toBe("ceo");
  });
  it("falls back to the root with most reports", () => {
    const agents = [agent("r1", { reportsTo: null }), agent("r2", { reportsTo: null }), agent("x", { reportsTo: "r2" })];
    expect(findBossId(agents)).toBe("r2");
  });
  it("ignores terminated agents and handles an empty org", () => {
    expect(findBossId([agent("dead", { role: "ceo", status: "terminated" })])).toBeNull();
    expect(findBossId([])).toBeNull();
  });
});

describe("placeOf", () => {
  it("maps every status to its zone", () => {
    expect(place(agent("boss", { status: "running" }))).toEqual({ zone: "atc" });
    expect(place(agent("a"))).toEqual({ zone: "cell" });
    expect(place(agent("a", { status: "active" }))).toEqual({ zone: "cell" });
    expect(place(agent("a", { status: "paused" }))).toEqual({ zone: "cell" });
    expect(place(agent("a", { status: "error" }))).toEqual({ zone: "cell" });
    expect(place(agent("a", { status: "pending_approval" }))).toEqual({ zone: "altar" });
    expect(place(agent("a", { status: "terminated" }))).toEqual({ zone: "gone" });
    expect(place(agent("a", { status: "running" })).zone).toBe("site");
  });
  it("sends petitioners to the altar unless they are working", () => {
    expect(place(agent("a"), ["a"])).toEqual({ zone: "altar" });
    expect(place(agent("a", { status: "running" }), ["a"]).zone).toBe("site");
  });
  it("terminated beats boss", () => {
    expect(place(agent("boss", { status: "terminated" }))).toEqual({ zone: "gone" });
  });
});

describe("siteFor", () => {
  it("is stable per project and honours overrides", () => {
    const task = { issueId: "i", identifier: null, title: "t", projectId: "p1", status: "in_progress" };
    const a = agent("a", { task });
    const b = agent("b", { task });
    expect(siteFor(a)).toBe(siteFor(b));
    expect(SITES.map((s) => s.id)).toContain(siteFor(a));
    expect(siteFor(a, { a: "sewer" })).toBe("sewer");
  });
  it("hash is FNV-1a", () => {
    expect(hash("")).toBe(0x811c9dc5);
    expect(hash("a")).toBe(0xe40c292c);
  });
});

describe("applyEvent", () => {
  it("run lifecycle moves the agent between running and idle/error", () => {
    let w = world([agent("a")]);
    w = applyEvent(w, { type: "run", phase: "started", agentId: "a", runId: "r1", issueId: "i1" });
    expect(w.agents[0]).toMatchObject({ status: "running", runId: "r1", task: { issueId: "i1" } });
    w = applyEvent(w, { type: "run", phase: "finished", agentId: "a", runId: "r1", issueId: "i1" });
    expect(w.agents[0]).toMatchObject({ status: "idle", runId: null });
    w = applyEvent(w, { type: "run", phase: "started", agentId: "a", runId: "r2", issueId: "i1" });
    w = applyEvent(w, { type: "run", phase: "failed", agentId: "a", runId: "r2", issueId: "i1" });
    expect(w.agents[0].status).toBe("error");
  });
  it("does not flip a paused agent to idle when a stale run finishes", () => {
    const w = applyEvent(world([agent("a", { status: "paused" })]), { type: "run", phase: "cancelled", agentId: "a", runId: "r", issueId: null });
    expect(w.agents[0].status).toBe("paused");
  });
  it("adds petitions once and resolves them", () => {
    const petition = { id: "p", source: "approval" as const, agentId: "a", issueId: null, kind: "hire", title: "t", summary: null, createdAt: "" };
    let w = applyEvent(world([]), { type: "petition", petition });
    w = applyEvent(w, { type: "petition", petition });
    expect(w.petitions).toHaveLength(1);
    w = applyEvent(w, { type: "petition-resolved", id: "p" });
    expect(w.petitions).toHaveLength(0);
  });
  it("ignores unknown agents and passive events", () => {
    const w = world([agent("a")]);
    expect(applyEvent(w, { type: "agent", agentId: "zzz", status: "error" }).agents[0].status).toBe("idle");
    expect(applyEvent(w, { type: "refresh" })).toBe(w);
  });
});
