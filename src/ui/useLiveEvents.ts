import { useEffect, useState } from "react";
import { fromLiveEvent, type LiveEvent } from "../shared/live.js";
import type { WorldEvent } from "../shared/world.js";

type Subscribe = (companyId: string, onEvent: (ev: WorldEvent) => void) => () => void;

/**
 * Company live events from the same WebSocket the board UI uses (same-origin, board session cookie).
 * The dev harness swaps the source via globalThis.__OVERLORD_LIVE__.
 */
export interface Seq { seq: number; ev: WorldEvent }

let nextSeq = 1;

export function useLiveEvents(companyId: string): Seq[] {
  const [events, setEvents] = useState<Seq[]>([]);
  useEffect(() => {
    const push = (ev: WorldEvent) => setEvents((xs) => [...xs.slice(-99), { seq: nextSeq++, ev }]);
    const fake = (globalThis as { __OVERLORD_LIVE__?: Subscribe }).__OVERLORD_LIVE__;
    return fake ? fake(companyId, push) : subscribeLive(companyId, push);
  }, [companyId]);
  return events;
}

function subscribeLive(companyId: string, push: (ev: WorldEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`);
    socket.onopen = () => {
      attempt = 0;
      push({ type: "refresh" }); // events are not replayed: reconcile whatever happened while disconnected
    };
    socket.onmessage = (msg) => {
      try {
        const ev = fromLiveEvent(JSON.parse(String(msg.data)) as LiveEvent);
        if (ev) push(ev);
      } catch { /* ignore non-JSON frames */ }
    };
    socket.onclose = () => {
      if (closed) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempt - 1, 4)));
    };
  };
  connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
