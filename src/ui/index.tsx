import { useEffect, useMemo, useRef, useState } from "react";
import { useHostNavigation, usePluginAction, type PluginPageProps, type PluginSidebarProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { findBossId, SITES, siteFor, type WorldEvent, type WorldSnapshot } from "../shared/world.js";
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

export function OverlordWorld({ companyId, userId, deathEveryMs }: { companyId: string; userId: string | null; deathEveryMs?: [number, number] }) {
  const { world, events, error, loading, refresh } = useWorld(companyId);
  const engine = useRef<OverlordEngine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const agent = world?.agents.find((a) => a.id === selected) ?? null;
  const whip = (id: string) => engine.current?.godWhip(id);
  useLlmQuips(companyId, events, (agentId, text) => engine.current?.say(agentId, text));

  return (
    <div className="ol-root">
      <WorldView world={world} events={events} onSelect={setSelected} engineRef={engine} deathEveryMs={deathEveryMs}>
        <Ticker world={world} events={events.map((x) => x.ev)} />
        <div className="ol-hud">
          {world && <span className="ol-chip">{world.agents.filter((a) => a.status === "running").length} toiling / {world.agents.length} owned</span>}
          {world && world.petitions.length > 0 && <span className="ol-chip error">{world.petitions.length} {world.petitions.length === 1 ? "petition" : "petitions"}</span>}
        </div>
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

/** When a slave starts a run, ask the worker for a task-aware quip (it rate limits and may say nothing). */
function useLlmQuips(companyId: string, events: Seq[], say: (agentId: string, text: string) => void) {
  const ask = usePluginAction("llm-quip");
  const handled = useRef(events.at(-1)?.seq ?? 0);
  useEffect(() => {
    for (const { ev } of unseen(events, handled.current)) {
      if (ev.type !== "run" || ev.phase !== "started" || !ev.issueId) continue;
      void ask({ companyId, agentId: ev.agentId, issueId: ev.issueId })
        .then((r) => { const text = (r as { text?: string | null } | null)?.text; if (text) say(ev.agentId, text); })
        .catch(() => { /* the static bank covers it */ });
    }
    handled.current = events.at(-1)?.seq ?? handled.current;
  }, [events]);
}

function Ticker({ world, events }: { world: WorldSnapshot | null; events: WorldEvent[] }) {
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
            : e.phase === "failed" ? `${name(e.agentId)} was thrown in the stocks`
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
    </div>
  );
}

export function OverlordWidget({ context }: PluginWidgetProps) {
  useStyles();
  const nav = useHostNavigation();
  if (!context.companyId) return null;
  return (
    <div className="ol-root" onClick={() => nav.navigate(nav.resolveHref("/overlord"))} title="Open the Overlord view">
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
