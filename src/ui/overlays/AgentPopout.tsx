import { useEffect, useState } from "react";
import { MarkdownBlock, useHostNavigation, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { SITES, siteFor, type WorldAgent, type WorldEvent } from "../../shared/world.js";
import { Composer, Panel, useCommand } from "./Panel.js";

interface Detail {
  issue: { id: string; identifier: string | null; title: string; status: string; description: string | null } | null;
  comments: { id: string; body: string; authorAgentId: string | null; authorUserId: string | null; createdAt: string }[];
  interactions: { id: string; kind: string; title: string | null; summary: string | null }[];
}

const STATUS_LABEL: Record<string, string> = {
  running: "toiling", idle: "caged", active: "caged", paused: "chained", error: "broken in its cell",
  pending_approval: "begging to be hired", terminated: "deceased",
};

export function AgentPopout({ agent, isBoss, companyId, userId, events, onClose, onWhip }: {
  agent: WorldAgent;
  isBoss: boolean;
  companyId: string;
  userId: string | null;
  events: WorldEvent[];
  onClose: () => void;
  onWhip: (agentId: string) => void;
}) {
  const nav = useHostNavigation();
  const issueId = agent.task?.issueId ?? null;
  const detail = usePluginData<Detail>("agent-detail", { companyId, issueId });
  const { run, busy } = useCommand(onWhip, () => detail.refresh());
  const [draft, setDraft] = useState("");
  const log = useRunLog(companyId, agent);

  useEffect(() => {
    if (events.some((e) => e.type === "comment" && e.issueId === issueId)) detail.refresh();
  }, [events, issueId]);

  const site = SITES.find((s) => s.id === siteFor(agent));
  const issue = detail.data?.issue;
  const issueHref = issue ? nav.resolveHref(`/issues/${issue.identifier ?? issue.id}`) : null;

  return (
    <Panel
      title={`${agent.name}${agent.title ? ` - ${agent.title}` : ""}`}
      onClose={onClose}
      initial={{ x: 24, y: 96 }}
      footer={(
        <>
          {issueId && (
            <button className="ol-btn ol-btn-gold" disabled={busy || !draft.trim()} onClick={async () => {
              if (await run("reply", { companyId, issueId, body: draft }, agent.id)) setDraft("");
            }}>Reply</button>
          )}
          {issueId && (
            <button className="ol-btn ol-btn-red" disabled={busy} onClick={async () => {
              if (await run("review-again", { companyId, issueId, note: draft.trim() || undefined }, agent.id)) setDraft("");
            }}>Review again</button>
          )}
          {agent.status !== "paused" && agent.status !== "terminated" && (
            <button className="ol-btn" disabled={busy} onClick={() => run("wake", { companyId, agentId: agent.id, issueId }, agent.id)}>
              {agent.status === "error" ? "Pardon" : "Wake"}
            </button>
          )}
          {agent.status === "paused"
            ? <button className="ol-btn" disabled={busy} onClick={() => run("resume", { companyId, agentId: agent.id }, agent.id)}>Unchain</button>
            : agent.status !== "terminated" && <button className="ol-btn" disabled={busy} onClick={() => run("pause", { companyId, agentId: agent.id }, null, false)}>Chain</button>}
        </>
      )}
    >
      <div className="ol-meta">
        <span className={`ol-chip ${agent.status}`}>{isBoss ? (agent.status === "running" ? "dispatching" : "napping on duty") : STATUS_LABEL[agent.status] ?? agent.status}</span>
        <span className="ol-chip">{agent.role}</span>
        {agent.status === "running" && site && <span className="ol-chip">{site.name}</span>}
        {agent.overBudget && <span className="ol-chip error">over budget</span>}
        <a className="ol-link" {...nav.linkProps(`/agents/${agent.id}`)}>agent page</a>
      </div>
      {issue ? (
        <div>
          <a className="ol-link" href={issueHref ?? undefined} onClick={(e) => { e.preventDefault(); if (issueHref) nav.navigate(issueHref); }}>
            {issue.identifier ? `${issue.identifier} ` : ""}{issue.title}
          </a>
          <span className="ol-chip" style={{ marginLeft: 6 }}>{issue.status}</span>
        </div>
      ) : (
        <div>No task. Idle hands are the Overlord's playthings.</div>
      )}
      {log && <pre className="ol-log" aria-label="Live run log">{log}</pre>}
      {detail.data?.interactions.map((i) => (
        <div key={i.id} className="ol-comment mine"><small>question for you</small>{i.title ?? i.kind}{i.summary ? `: ${i.summary}` : ""}</div>
      ))}
      <div className="ol-comments">
        {detail.data?.comments.slice(-12).map((c) => (
          <div key={c.id} className={`ol-comment ${c.authorUserId && c.authorUserId === userId ? "mine" : ""}`}>
            <small>{c.authorAgentId === agent.id ? agent.name : c.authorUserId === userId ? "You (God)" : c.authorUserId ? "a human" : "another slave"} - {new Date(c.createdAt).toLocaleString()}</small>
            <MarkdownBlock content={c.body} />
          </div>
        ))}
        {detail.loading && !detail.data && <div>Reading the scrolls...</div>}
      </div>
      {issueId && <Composer value={draft} onChange={setDraft} placeholder="Command your slave (markdown)" />}
    </Panel>
  );
}

// Core REST (same-origin, board session) because the plugin SDK has no run-log reader in 2026.1023.0.
// shortcut: polls the log every 3 s while open; upgrade to the live-events websocket if it gets heavy.
function useRunLog(companyId: string, agent: WorldAgent): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (agent.status !== "running") { setText(null); return; }
    let stop = false;
    let runId = agent.runId;
    let offset = 0;
    let buf = "";
    const tick = async () => {
      try {
        if (!runId) {
          const runs = (await (await fetch(`/api/companies/${companyId}/live-runs`, { credentials: "include" })).json()) as { id: string; agentId: string }[];
          runId = runs.find((r) => r.agentId === agent.id)?.id ?? null;
        }
        if (runId) {
          const res = await fetch(`/api/heartbeat-runs/${runId}/log?offset=${offset}&limitBytes=32000`, { credentials: "include" });
          if (res.ok) {
            const body = (await res.json()) as { content: string; nextOffset?: number };
            offset = body.nextOffset ?? offset + body.content.length;
            buf = (buf + readable(body.content)).slice(-3000);
            if (!stop) setText(buf || "...");
          }
        }
      } catch { /* the log is a nicety; the panel works without it */ }
      if (!stop) setTimeout(tick, 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [companyId, agent.id, agent.status, agent.runId]);
  return text;
}

/** Run logs are JSONL chunks; show the human-readable text parts. */
function readable(content: string): string {
  return content.split("\n").map((line) => {
    try {
      const j = JSON.parse(line) as { chunk?: string; message?: string; text?: string };
      return j.chunk ?? j.message ?? j.text ?? "";
    } catch {
      return line;
    }
  }).filter(Boolean).join("\n");
}
