import { useEffect, useMemo, useRef, useState } from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { applyEvent, type WorldSnapshot } from "../shared/world.js";
import { useLiveEvents, type Seq } from "./useLiveEvents.js";

const POLL_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 1_500;

/** Snapshot from the worker, kept live by the company event socket and healed by a slow poll. */
export function useWorld(companyId: string) {
  const data = usePluginData<WorldSnapshot>("world", { companyId });
  const all = useLiveEvents(companyId);
  const [live, setLive] = useState<WorldSnapshot | null>(null);
  const seen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (data.data) setLive(data.data); }, [data.data]);

  useEffect(() => {
    const id = setInterval(() => data.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [data.refresh]);

  useEffect(() => {
    const next = unseen(all, seen.current).map((x) => x.ev);
    seen.current = all.at(-1)?.seq ?? seen.current;
    if (!next.length) return;
    setLive((w) => (w ? next.reduce(applyEvent, w) : w));
    // Runs carry no task title and petitions arrive as activity: let the worker fill in the details.
    if (next.some((e) => e.type === "refresh" || e.type === "comment" || e.type === "run")) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => data.refresh(), REFRESH_DEBOUNCE_MS);
    }
  }, [all, data.refresh]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useMemo(() => ({
    world: live,
    events: all,
    error: data.error,
    loading: data.loading && !live,
    refresh: data.refresh,
  }), [live, all, data.error, data.loading, data.refresh]);
}

export function unseen(events: Seq[], lastSeq: number): Seq[] {
  return events.filter((x) => x.seq > lastSeq);
}
