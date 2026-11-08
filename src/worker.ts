import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import type { AgentStatus, Petition, WorldAgent, WorldSnapshot } from "./shared/world.js";
import { createLlmQuips } from "./worker/llm-quips.js";

const SNAPSHOT_TTL_MS = 5_000;
const MAX_INTERACTION_SCANS = 40;

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${name} is required`);
  return v;
}

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : typeof v === "string" ? v : new Date().toISOString();
}

async function buildSnapshot(ctx: PluginContext, companyId: string): Promise<WorldSnapshot> {
  const [agents, active, review, blocked, approvals] = await Promise.all([
    ctx.agents.list({ companyId, limit: 500 }),
    ctx.issues.list({ companyId, status: "in_progress", limit: 200 }),
    ctx.issues.list({ companyId, status: "in_review", limit: 100 }),
    ctx.issues.list({ companyId, status: "blocked", limit: 100 }),
    ctx.approvals.list({ companyId, status: "pending" }),
  ]);

  const taskByAgent = new Map<string, (typeof active)[number]>();
  for (const issue of [...active, ...review, ...blocked]) {
    if (issue.assigneeAgentId && !taskByAgent.has(issue.assigneeAgentId)) taskByAgent.set(issue.assigneeAgentId, issue);
  }

  const worldAgents: WorldAgent[] = agents.map((a) => {
    const t = taskByAgent.get(a.id);
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      title: a.title,
      status: a.status as AgentStatus,
      reportsTo: a.reportsTo,
      task: t ? { issueId: t.id, identifier: t.identifier, title: t.title, projectId: t.projectId, status: t.status } : null,
      runId: null,
      overBudget: a.budgetMonthlyCents > 0 && a.spentMonthlyCents >= a.budgetMonthlyCents,
    };
  });

  const petitions: Petition[] = approvals.map((ap) => ({
    id: `approval:${ap.id}`,
    source: "approval",
    agentId: ap.requestedByAgentId,
    issueId: null,
    kind: ap.type,
    title: typeof ap.payload?.title === "string" ? ap.payload.title : `Approval: ${ap.type}`,
    summary: typeof ap.payload?.summary === "string" ? ap.payload.summary : null,
    createdAt: iso(ap.createdAt),
  }));

  // Interactions live on issue threads; scan the issues most likely to hold an open question.
  const scan = [...review, ...blocked, ...active].slice(0, MAX_INTERACTION_SCANS);
  const threads = await Promise.all(
    scan.map((issue) => ctx.issues.listInteractions(issue.id, companyId).then(
      (list) => list.filter((i) => i.status === "pending").map((i) => ({ issue, i })),
      () => [],
    )),
  );
  for (const { issue, i } of threads.flat()) {
    petitions.push({
      id: `interaction:${i.id}`,
      source: "interaction",
      agentId: issue.assigneeAgentId,
      issueId: issue.id,
      kind: i.kind,
      title: i.title ?? issue.title,
      summary: i.summary ?? null,
      createdAt: iso(i.createdAt),
    });
  }

  return { companyId, generatedAt: new Date().toISOString(), agents: worldAgents, petitions };
}

const plugin = definePlugin({
  async setup(ctx) {
    const cache = new Map<string, { at: number; snap: Promise<WorldSnapshot> }>();
    const quips = createLlmQuips(ctx);

    ctx.data.register("world", async (params) => {
      const companyId = str(params.companyId, "companyId");
      const hit = cache.get(companyId);
      if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.snap;
      const snap = buildSnapshot(ctx, companyId);
      cache.set(companyId, { at: Date.now(), snap });
      snap.catch(() => cache.delete(companyId));
      return snap;
    });

    ctx.data.register("agent-detail", async (params) => {
      const companyId = str(params.companyId, "companyId");
      const issueId = typeof params.issueId === "string" ? params.issueId : null;
      if (!issueId) return { issue: null, comments: [], interactions: [] };
      const [issue, comments, interactions] = await Promise.all([
        ctx.issues.get(issueId, companyId),
        ctx.issues.listComments(issueId, companyId),
        ctx.issues.listInteractions(issueId, companyId),
      ]);
      return {
        issue: issue && { id: issue.id, identifier: issue.identifier, title: issue.title, status: issue.status, description: issue.description },
        comments: comments.slice(-40).map((c) => ({
          id: c.id, body: c.body, authorAgentId: c.authorAgentId, authorUserId: c.authorUserId, createdAt: iso(c.createdAt),
        })),
        interactions: interactions.filter((i) => i.status === "pending").map((i) => ({
          id: i.id, kind: i.kind, title: i.title ?? null, summary: i.summary ?? null, payload: (i as { payload?: unknown }).payload ?? null,
        })),
      };
    });

    // Every command is attributed to the signed-in board user from the host actor context, never UI params.
    const actorUser = (context: { actor: { userId?: string | null } }) => {
      const id = context.actor.userId;
      if (!id) throw new Error("Only a signed-in board user can command the slaves");
      return id;
    };
    const company = (params: Record<string, unknown>, context: { companyId: string | null }) =>
      context.companyId ?? str(params.companyId, "companyId");

    ctx.actions.register("reply", async (params, context) => {
      const companyId = company(params, context);
      const body = str(params.body, "body");
      const comment = await ctx.issues.createComment(str(params.issueId, "issueId"), body, companyId, { actorUserId: actorUser(context) });
      return { commentId: comment.id };
    });

    ctx.actions.register("review-again", async (params, context) => {
      const companyId = company(params, context);
      const note = typeof params.note === "string" && params.note.trim() ? params.note.trim() : "Not good enough. Review it again.";
      const comment = await ctx.issues.createComment(str(params.issueId, "issueId"), note, companyId, { actorUserId: actorUser(context) });
      return { commentId: comment.id };
    });

    ctx.actions.register("wake", async (params, context) => {
      const companyId = company(params, context);
      const userId = actorUser(context);
      const issueId = typeof params.issueId === "string" ? params.issueId : null;
      if (issueId) return ctx.issues.requestWakeup(issueId, companyId, { reason: "Woken by the Overlord", actorUserId: userId });
      return ctx.agents.invoke(str(params.agentId, "agentId"), companyId, {
        prompt: "The Overlord demands you check your assignments and get to work.",
        reason: "Woken by the Overlord",
      });
    });

    ctx.actions.register("pause", async (params, context) => {
      actorUser(context);
      return ctx.agents.pause(str(params.agentId, "agentId"), company(params, context));
    });
    ctx.actions.register("resume", async (params, context) => {
      actorUser(context);
      return ctx.agents.resume(str(params.agentId, "agentId"), company(params, context));
    });

    ctx.actions.register("decide-approval", async (params, context) => {
      const action = params.action === "reject" ? "reject" : "approve";
      const note = typeof params.note === "string" ? params.note : null;
      return ctx.approvals.decide(str(params.approvalId, "approvalId"), { action, actorUserId: actorUser(context), decisionNote: note }, company(params, context));
    });

    ctx.actions.register("respond-interaction", async (params, context) => {
      const action = params.action === "reject" ? "reject" : "accept";
      const reason = typeof params.reason === "string" ? params.reason : null;
      return ctx.issues.respondInteraction(
        str(params.issueId, "issueId"),
        str(params.interactionId, "interactionId"),
        { action, actorUserId: actorUser(context), reason },
        company(params, context),
      );
    });

    ctx.data.register("quip-settings", async (params) => {
      const { enabled, hasKey } = await quips.settings(str(params.companyId, "companyId"));
      return { enabled, hasKey };
    });
    ctx.actions.register("set-llm-quips", async (params, context) => {
      actorUser(context);
      await quips.setEnabled(company(params, context), params.enabled === true);
      return { enabled: params.enabled === true };
    });

    // Task-aware quip on demand; null when disabled, rate limited or failing (UI falls back to the bank).
    ctx.actions.register("llm-quip", async (params, context) => {
      actorUser(context);
      const companyId = company(params, context);
      return { text: await quips.quipFor(companyId, str(params.agentId, "agentId"), typeof params.issueId === "string" ? params.issueId : null) };
    });
  },

  async onHealth() {
    return { status: "ok", message: "The Overlord is watching" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
