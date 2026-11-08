import { beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import type { WorldSnapshot } from "../src/shared/world.js";

const CO = "co-1";
const now = new Date();
const agent = (id: string, over: Record<string, unknown> = {}) => ({
  id, companyId: CO, name: id, role: "engineer", title: null, icon: null, status: "idle", reportsTo: "boss",
  budgetMonthlyCents: 0, spentMonthlyCents: 0, lastHeartbeatAt: null, createdAt: now, updatedAt: now, ...over,
});
const issue = (id: string, over: Record<string, unknown> = {}) => ({
  id, companyId: CO, identifier: `T-${id}`, title: `task ${id}`, projectId: "p1", status: "in_progress",
  assigneeAgentId: null, createdAt: now, updatedAt: now, ...over,
});

let h: TestHarness;

beforeEach(async () => {
  h = createTestHarness({ manifest });
  h.seed({
    agents: [agent("boss", { role: "ceo", reportsTo: null }), agent("a", { status: "running" }), agent("b", { budgetMonthlyCents: 100, spentMonthlyCents: 150 })] as never,
    issues: [issue("i1", { assigneeAgentId: "a" })] as never,
    accessMembers: [{ id: "m1", companyId: CO, principalType: "user", principalId: "alex", status: "active", membershipRole: "owner", grants: [], createdAt: now, updatedAt: now }] as never,
  });
  await plugin.definition.setup(h.ctx);
});

describe("world snapshot", () => {
  it("joins agents with their current task and budget state", async () => {
    const w = await h.getData<WorldSnapshot>("world", { companyId: CO });
    expect(w.agents).toHaveLength(3);
    expect(w.agents.find((x) => x.id === "a")?.task).toMatchObject({ issueId: "i1", identifier: "T-i1", projectId: "p1" });
    expect(w.agents.find((x) => x.id === "b")?.overBudget).toBe(true);
    expect(w.petitions).toEqual([]);
  });

  it("rejects a missing company", async () => {
    await expect(h.getData("world", {})).rejects.toThrow(/companyId/);
  });
});

describe("commands", () => {
  it("attributes replies to the signed-in board user from the host actor, not params", async () => {
    await h.performAction("reply", { companyId: CO, issueId: "i1", body: "Faster.", actorUserId: "mallory" }, { actor: { userId: "alex", companyId: CO } as never, companyId: CO });
    const comments = await h.ctx.issues.listComments("i1", CO);
    expect(comments.at(-1)).toMatchObject({ body: "Faster.", authorUserId: "alex", authorAgentId: null });
  });

  it("refuses commands without a signed-in user", async () => {
    await expect(h.performAction("reply", { companyId: CO, issueId: "i1", body: "x" }, { actor: { userId: null } as never, companyId: CO })).rejects.toThrow(/signed-in/);
  });

  it("review-again posts a default scolding when no note is given", async () => {
    await h.performAction("review-again", { companyId: CO, issueId: "i1" }, { actor: { userId: "alex" } as never, companyId: CO });
    const comments = await h.ctx.issues.listComments("i1", CO);
    expect(comments.at(-1)?.body).toMatch(/Review it again/);
  });
});

describe("llm quips", () => {
  it("the in-world switch is stored per company and overrides the settings default", async () => {
    const actor = { actor: { userId: "alex" } as never, companyId: CO };
    expect(await h.getData("quip-settings", { companyId: CO })).toEqual({ enabled: false, hasKey: false });
    await h.performAction("set-llm-quips", { companyId: CO, enabled: true }, actor);
    expect(await h.getData("quip-settings", { companyId: CO })).toEqual({ enabled: true, hasKey: false });
    // switched on but no key: still silent
    const r = await h.performAction<{ text: string | null }>("llm-quip", { companyId: CO, agentId: "a", issueId: "i1" }, actor);
    expect(r.text).toBeNull();
  });

  it("stays silent unless enabled with a key", async () => {
    const r = await h.performAction<{ text: string | null }>("llm-quip", { companyId: CO, agentId: "a", issueId: "i1" }, { actor: { userId: "alex" } as never, companyId: CO });
    expect(r.text).toBeNull();
  });
});
