import { useState } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import type { Petition, WorldSnapshot } from "../../shared/world.js";
import { Composer, Panel, useCommand } from "./Panel.js";

const DISMISSED_KEY = "overlord:dismissed-petitions";

function dismissed(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

/** Pops the oldest open petition (approval or question) addressed to the board. */
export function PetitionModal({ world, onWhip, onAfter }: { world: WorldSnapshot; onWhip: (agentId: string) => void; onAfter: () => void }) {
  const nav = useHostNavigation();
  const [hidden, setHidden] = useState(dismissed);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());
  const { run, busy } = useCommand(onWhip, onAfter);
  const open = [...world.petitions]
    .filter((p) => !hidden.has(p.id) && !done.has(p.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const p = open[0];
  if (!p) return null;

  const agent = world.agents.find((a) => a.id === p.agentId);
  const later = () => {
    const next = new Set(hidden).add(p.id);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    setHidden(next);
  };
  const finish = async (ok: Promise<boolean>) => { if (await ok) { setDone(new Set(done).add(p.id)); setNote(""); } };
  const [, rawId] = p.id.split(/:(.+)/);

  return (
    <Panel
      className="ol-petition"
      title={`Petition from ${agent?.name ?? "a nameless wretch"}${open.length > 1 ? ` (+${open.length - 1})` : ""}`}
      onClose={later}
      footer={<PetitionButtons p={p} rawId={rawId} note={note} busy={busy} finish={finish} run={run} later={later} companyId={world.companyId}
        openIssue={() => p.issueId && nav.navigate(nav.resolveHref(`/issues/${p.issueId}`))} />}
    >
      <div><b>{p.title}</b></div>
      {p.summary && <div>{p.summary}</div>}
      <div className="ol-chip" style={{ alignSelf: "flex-start" }}>{p.source === "approval" ? `approval: ${p.kind}` : p.kind.replaceAll("_", " ")}</div>
      <Composer value={note} onChange={setNote} placeholder={p.source === "approval" ? "Decision note (optional)" : "Your divine answer"} />
    </Panel>
  );
}

function PetitionButtons({ p, rawId, note, busy, finish, run, later, companyId, openIssue }: {
  p: Petition; rawId: string; note: string; busy: boolean; companyId: string;
  finish: (ok: Promise<boolean>) => Promise<void>;
  run: ReturnType<typeof useCommand>["run"];
  later: () => void;
  openIssue: () => void;
}) {
  const agentId = p.agentId;
  if (p.source === "approval") {
    return (
      <>
        <button className="ol-btn ol-btn-gold" disabled={busy} onClick={() => finish(run("decide-approval", { companyId, approvalId: rawId, action: "approve", note }, agentId))}>Grant</button>
        <button className="ol-btn ol-btn-red" disabled={busy} onClick={() => finish(run("decide-approval", { companyId, approvalId: rawId, action: "reject", note }, agentId))}>Deny</button>
        <button className="ol-btn" onClick={later}>Later</button>
      </>
    );
  }
  const confirm = p.kind === "request_confirmation" || p.kind === "request_checkbox_confirmation";
  return (
    <>
      {confirm && <button className="ol-btn ol-btn-gold" disabled={busy} onClick={() => finish(run("respond-interaction", { companyId, issueId: p.issueId, interactionId: rawId, action: "accept", reason: note || null }, agentId))}>Yes</button>}
      {confirm && <button className="ol-btn ol-btn-red" disabled={busy} onClick={() => finish(run("respond-interaction", { companyId, issueId: p.issueId, interactionId: rawId, action: "reject", reason: note || null }, agentId))}>No</button>}
      {!confirm && p.issueId && <button className="ol-btn ol-btn-gold" disabled={busy || !note.trim()} onClick={() => finish(run("reply", { companyId, issueId: p.issueId, body: note }, agentId))}>Answer</button>}
      {p.issueId && <button className="ol-btn" onClick={openIssue}>Open in Paperclip</button>}
      <button className="ol-btn" onClick={later}>Later</button>
    </>
  );
}
