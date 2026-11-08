import { useEffect, useMemo, useRef, useState } from "react";
import { useHostLocation, useHostNavigation, usePluginAction, usePluginData, type PluginPageProps, type PluginSidebarProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { findBossId, SITES, siteFor, type SiteId, type WorldEvent, type WorldSnapshot } from "../shared/world.js";
import type { OverlordEngine } from "./game/engine.js";
import { AgentPopout } from "./overlays/AgentPopout.js";
import { PetitionModal } from "./overlays/PetitionModal.js";
import { useStyles } from "./useStyles.js";
import type { Seq } from "./useLiveEvents.js";
import { unseen, useWorld } from "./useWorld.js";
import { WorldView } from "./WorldView.js";

export function OverlordPage({ context }: PluginPageProps) {
  useStyles();
  if (!context.companyId) return <div className="ol-root ol-empty">Pick a company to rule.</div>;
  return <OverlordWorld companyId={context.companyId} userId={context.userId} />;
}

export function OverlordWorld({ companyId, userId, deathEveryMs, siteOverrides }: {
  companyId: string;
  userId: string | null;
  deathEveryMs?: [number, number];
  /** Pin agents to rooms (agent id -> site); the dev harness uses it for its full-house view. */
  siteOverrides?: Record<string, SiteId>;
}) {
  const { world, events, error, loading, refresh } = useWorld(companyId);
  const engine = useRef<OverlordEngine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const agent = world?.agents.find((a) => a.id === selected) ?? null;
  const whip = (id: string) => engine.current?.godWhip(id);
  const quipSettings = usePluginData<{ enabled: boolean; hasKey: boolean }>("quip-settings", { companyId });
  const setQuips = usePluginAction("set-llm-quips");
  const aiQuips = !!quipSettings.data?.enabled && !!quipSettings.data?.hasKey;
  useLlmQuips(companyId, events, world, aiQuips, (agentId, text) => engine.current?.say(agentId, text));

  return (
    <div className="ol-root">
      <WorldView world={world} events={events} onSelect={setSelected} engineRef={engine} deathEveryMs={deathEveryMs} overrides={siteOverrides}>
        <Ticker world={world} events={events.map((x) => x.ev)}>
        <div className="ol-hud">
          {world && <span className="ol-chip">{world.agents.filter((a) => a.status === "running").length} toiling / {world.agents.length} owned</span>}
          {quipSettings.data && (
            <button
              className={`ol-chip ol-toggle${aiQuips ? " on" : ""}`}
              disabled={!quipSettings.data.hasKey}
              title={quipSettings.data.hasKey
                ? "Slaves quip about their actual task via Claude Haiku (uses API tokens, rate limited)"
                : "Set an Anthropic API key in the Overlord plugin settings to enable AI quips"}
              onClick={async () => { await setQuips({ companyId, enabled: !aiQuips }); quipSettings.refresh(); }}
            >
              AI quips: {aiQuips ? "on" : "off"}
            </button>
          )}
          {world && world.petitions.length > 0 && <span className="ol-chip error">{world.petitions.length} {world.petitions.length === 1 ? "petition" : "petitions"}</span>}
        </div>
        </Ticker>
        {loading && <div className="ol-empty" style={{ position: "absolute", inset: 0 }}>Counting your slaves...</div>}
        {error && !world && <div className="ol-empty" style={{ position: "absolute", inset: 0 }}>The Overlord's eye is clouded: {error.message}</div>}
      </WorldView>
      {agent && (
        <AgentPopout agent={agent} isBoss={!!world && findBossId(world.agents) === agent.id} companyId={companyId} userId={userId} events={events.map((x) => x.ev)} onClose={() => setSelected(null)} onWhip={whip} />
      )}
      {world && <PetitionModal world={world} onWhip={whip} onAfter={refresh} />}
    </div>
  );
}

/**
 * With AI quips on, slaves comment on their real task: when a run starts, and now and then while working.
 * The worker rate limits (1 per agent per 15 min, 20 per hour) and may say nothing.
 */
function useLlmQuips(companyId: string, events: Seq[], world: WorldSnapshot | null, enabled: boolean, say: (agentId: string, text: string) => void) {
  const ask = usePluginAction("llm-quip");
  const handled = useRef(events.at(-1)?.seq ?? 0);
  const worldRef = useRef(world);
  worldRef.current = world;
  const quip = (agentId: string, issueId: string) => {
    void ask({ companyId, agentId, issueId })
      .then((r) => { const text = (r as { text?: string | null } | null)?.text; if (text) say(agentId, text); })
      .catch(() => { /* the static bank covers it */ });
  };
  useEffect(() => {
    const fresh = unseen(events, handled.current);
    handled.current = events.at(-1)?.seq ?? handled.current;
    if (!enabled) return;
    for (const { ev } of fresh) if (ev.type === "run" && ev.phase === "started" && ev.issueId) quip(ev.agentId, ev.issueId);
  }, [events, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const busy = worldRef.current?.agents.filter((a) => a.status === "running" && a.task) ?? [];
      const a = busy[Math.floor(Math.random() * busy.length)];
      if (a?.task) quip(a.id, a.task.issueId);
    }, 75_000);
    return () => clearInterval(id);
  }, [enabled, companyId]);
}

function Ticker({ world, events, children }: { world: WorldSnapshot | null; events: WorldEvent[]; children?: React.ReactNode }) {
  const lines = useMemo(() => {
    if (!world) return [];
    const name = (id: string | null) => world.agents.find((a) => a.id === id)?.name ?? "A slave";
    const out: string[] = [];
    for (const e of events.slice(-40).reverse()) {
      if (e.type === "run") {
        const a = world.agents.find((x) => x.id === e.agentId);
        const site = a ? SITES.find((s) => s.id === siteFor(a))?.name : "the pits";
        out.push(e.phase === "started" ? `${name(e.agentId)} marched to the ${site}`
          : e.phase === "finished" ? `${name(e.agentId)} crawled back to the cell`
            : e.phase === "failed" ? `${name(e.agentId)} broke down in the cell`
              : `${name(e.agentId)} was recalled`);
      } else if (e.type === "comment" && e.authorAgentId) out.push(`${name(e.authorAgentId)} sent a scroll`);
      else if (e.type === "petition") out.push(`${name(e.petition.agentId)} begs for an audience`);
      if (out.length >= 4) break;
    }
    return out.length ? out : [`${world.agents.length} souls in your service. Productivity: insufficient.`];
  }, [world, events]);
  return (
    <div className="ol-ticker" aria-live="polite">
      <b>OVERSEER'S LOG</b>
      {lines.map((l, i) => <span key={i}>{l}</span>)}
      {children}
    </div>
  );
}

export function OverlordWidget({ context }: PluginWidgetProps) {
  useStyles();
  const nav = useHostNavigation();
  const { pathname } = useHostLocation();
  if (!context.companyId) return null;
  // The Dashboard (2026.1106.0) renders widgets with only {companyId}, so the host can't prefix the
  // link itself; the dashboard URL already starts with the company prefix.
  const prefix = context.companyPrefix ?? pathname.split("/")[1];
  return (
    <div className="ol-root" onClick={() => nav.navigate(`/${prefix}/overlord`)} title="Open the Overlord view">
      <MiniWorld companyId={context.companyId} />
    </div>
  );
}

function MiniWorld({ companyId }: { companyId: string }) {
  const { world, events } = useWorld(companyId);
  return <WorldView world={world} events={events} mini />;
}

export function OverlordSidebarLink(_: PluginSidebarProps) {
  useStyles();
  const nav = useHostNavigation();
  return (
    <a className="ol-sidebar-link" {...nav.linkProps("/overlord")}>
      <i aria-hidden="true" />Overlord
    </a>
  );
}
