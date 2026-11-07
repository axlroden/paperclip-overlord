import { useEffect, useRef, type MutableRefObject } from "react";
import { findBossId, type WorldSnapshot } from "../shared/world.js";
import { OverlordEngine } from "./game/engine.js";
import { makeQuip } from "./quips.js";
import type { Seq } from "./useLiveEvents.js";
import { useStyles } from "./useStyles.js";
import { unseen } from "./useWorld.js";

export interface WorldViewProps {
  world: WorldSnapshot | null;
  events: Seq[];
  mini?: boolean;
  onSelect?: (agentId: string) => void;
  engineRef?: MutableRefObject<OverlordEngine | null>;
  deathEveryMs?: [number, number];
  children?: React.ReactNode;
}

export function WorldView({ world, events, mini, onSelect, engineRef, deathEveryMs, children }: WorldViewProps) {
  useStyles();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<OverlordEngine | null>(null);
  const worldRef = useRef(world);
  const selectRef = useRef(onSelect);
  worldRef.current = world;
  selectRef.current = onSelect;

  useEffect(() => {
    let alive = true;
    const quip = makeQuip(() => {
      const w = worldRef.current;
      const id = w && findBossId(w.agents);
      return w?.agents.find((a) => a.id === id)?.name ?? null;
    });
    void OverlordEngine.create(host.current!, { mini, quip, deathEveryMs, onSelect: (id) => selectRef.current?.(id) }).then((e) => {
      if (!alive) { e.destroy(); return; }
      engine.current = e;
      if (engineRef) engineRef.current = e;
      if (worldRef.current) e.setWorld(worldRef.current);
    }).catch((err: unknown) => {
      console.error("[overlord] engine failed to start", err);
      if (alive && host.current) host.current.dataset.error = err instanceof Error ? err.message : String(err);
    });
    return () => {
      alive = false;
      engine.current?.destroy();
      engine.current = null;
      if (engineRef) engineRef.current = null;
    };
  }, [mini]);

  useEffect(() => { if (world) engine.current?.setWorld(world); }, [world]);
  const handled = useRef(events.at(-1)?.seq ?? 0); // only events that arrive after mount animate
  useEffect(() => {
    for (const { ev } of unseen(events, handled.current)) engine.current?.handle(ev);
    handled.current = events.at(-1)?.seq ?? handled.current;
  }, [events]);

  return (
    <div className={mini ? "ol-stage ol-mini" : "ol-stage"} ref={host}>
      {children}
    </div>
  );
}
