// Maps Paperclip's company live-event WebSocket messages (/api/companies/:id/events/ws, the feed the
// board UI itself uses) to world events. Paperclip 2026.1023.0 does not wire the plugin SSE stream bus
// (server/src/app.ts passes no streamBus, so /bridge/stream/* answers 501), so this is the live path.
import type { AgentStatus, WorldEvent } from "./world.js";

export interface LiveEvent {
  id?: number;
  companyId?: string;
  type: string;
  createdAt?: string;
  payload?: Record<string, unknown> | null;
}

const RUN_PHASE: Record<string, "started" | "finished" | "failed" | "cancelled"> = {
  running: "started",
  succeeded: "finished",
  failed: "failed",
  timed_out: "failed",
  cancelled: "cancelled",
};

const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function fromLiveEvent(ev: LiveEvent): WorldEvent | null {
  const p = ev.payload ?? {};
  switch (ev.type) {
    case "heartbeat.run.queued": {
      const agentId = s(p.agentId);
      return agentId ? { type: "queued", agentId } : null;
    }
    case "heartbeat.run.status": {
      const agentId = s(p.agentId);
      const phase = RUN_PHASE[String(p.status)];
      return agentId && phase ? { type: "run", phase, agentId, runId: s(p.runId) ?? "", issueId: s(p.issueId) } : null;
    }
    case "agent.status": {
      const agentId = s(p.agentId);
      const status = s(p.status);
      return agentId && status ? { type: "agent", agentId, status: status as AgentStatus } : null;
    }
    case "activity.logged": {
      const action = String(p.action ?? "");
      const issueId = s(p.issueId);
      if (action.includes("comment") && issueId) {
        return {
          type: "comment",
          issueId,
          authorAgentId: p.actorType === "agent" ? s(p.actorId) : null,
          authorUserId: p.actorType === "user" ? s(p.actorId) : null,
        };
      }
      return /approval|interaction|agent\.|issue\.(created|updated|assigned)|budget/.test(action) ? { type: "refresh" } : null;
    }
    default:
      return null;
  }
}
