// Dev harness: a fake host bridge so the real plugin UI runs in a plain browser tab against the simulator.
import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulator } from "./simulator.js";

const params = new URLSearchParams(location.search);
(globalThis as Record<string, unknown>).__OVERLORD_DEBUG__ = true;
const sim = new Simulator(params.has("fast") ? 3 : 1);
const log = (...a: unknown[]) => console.debug("[harness]", ...a);

function usePluginData(key: string, p?: Record<string, unknown>) {
  const [data, setData] = useState<unknown>(null);
  const issueId = p?.issueId ?? null;
  const load = useCallback(() => setData(key === "world" ? sim.snapshot() : sim.detail(issueId as string | null)), [key, issueId]);
  useEffect(load, [load]);
  return { data, loading: data === null, error: null, refresh: load };
}

// Live events come from the simulator instead of the company WebSocket.
(globalThis as Record<string, unknown>).__OVERLORD_LIVE__ = (_companyId: string, push: Parameters<Simulator["subscribe"]>[0]) => sim.subscribe(push);

function usePluginAction(key: string) {
  return async (p: Record<string, unknown> = {}) => { log("action", key, p); await new Promise((r) => setTimeout(r, 150)); return sim.act(key, p); };
}

const nav = {
  resolveHref: (to: string) => `#${to}`,
  navigate: (to: string) => log("navigate", to),
  linkProps: (to: string) => ({ href: `#${to}`, onClick: (e: React.MouseEvent) => { e.preventDefault(); log("navigate", to); } }),
};

(globalThis as Record<string, unknown>).__paperclipPluginBridge__ = {
  react: React,
  sdkUi: {
    usePluginData, usePluginAction,
    usePluginToast: () => (t: { title: string; body?: string }) => { log("toast", t); return null; },
    useHostContext: () => ({ companyId: sim.companyId, companyPrefix: "SIM", projectId: null, entityId: null, entityType: null, userId: "god" }),
    useHostNavigation: () => nav,
    useHostLocation: () => ({ pathname: "/SIM/overlord", search: "", hash: "" }),
    MarkdownBlock: ({ content }: { content: string }) => React.createElement("div", null, content.replace(/\*\*/g, "")),
    MarkdownEditor: () => null,
  },
};

const { OverlordWorld, OverlordWidget } = await import("../src/ui/index.js");
const fast: [number, number] | undefined = params.has("fast") ? [3000, 9000] : undefined;

createRoot(document.getElementById("root")!).render(
  params.has("widget")
    ? <div style={{ width: 520 }}><OverlordWidget context={{ companyId: sim.companyId, companyPrefix: "SIM", projectId: null, entityId: null, entityType: null, userId: "god" }} /></div>
    : <OverlordWorld companyId={sim.companyId} userId="god" deathEveryMs={fast} />,
);
