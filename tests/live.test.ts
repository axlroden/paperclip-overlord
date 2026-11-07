import { describe, expect, it } from "vitest";
import { fromLiveEvent } from "../src/shared/live.js";

describe("fromLiveEvent", () => {
  it("maps run lifecycle statuses", () => {
    const run = (status: string) => fromLiveEvent({ type: "heartbeat.run.status", payload: { runId: "r", agentId: "a", issueId: "i", status } });
    expect(run("running")).toEqual({ type: "run", phase: "started", agentId: "a", runId: "r", issueId: "i" });
    expect(run("succeeded")).toMatchObject({ phase: "finished" });
    expect(run("failed")).toMatchObject({ phase: "failed" });
    expect(run("timed_out")).toMatchObject({ phase: "failed" });
    expect(run("cancelled")).toMatchObject({ phase: "cancelled" });
    expect(run("queued")).toBeNull();
  });
  it("maps queued runs and agent status", () => {
    expect(fromLiveEvent({ type: "heartbeat.run.queued", payload: { runId: "r", agentId: "a" } })).toEqual({ type: "queued", agentId: "a" });
    expect(fromLiveEvent({ type: "agent.status", payload: { agentId: "a", status: "paused" } })).toEqual({ type: "agent", agentId: "a", status: "paused" });
  });
  it("turns comment activity into scrolls and approvals into refreshes", () => {
    expect(fromLiveEvent({ type: "activity.logged", payload: { action: "issue.comment_added", issueId: "i", actorType: "agent", actorId: "a" } }))
      .toEqual({ type: "comment", issueId: "i", authorAgentId: "a", authorUserId: null });
    expect(fromLiveEvent({ type: "activity.logged", payload: { action: "approval.created" } })).toEqual({ type: "refresh" });
    expect(fromLiveEvent({ type: "activity.logged", payload: { action: "heartbeat.log" } })).toBeNull();
  });
  it("ignores malformed and unknown events", () => {
    expect(fromLiveEvent({ type: "heartbeat.run.status", payload: { status: "running" } })).toBeNull();
    expect(fromLiveEvent({ type: "agent.status", payload: null })).toBeNull();
    expect(fromLiveEvent({ type: "plugin.ui.updated" })).toBeNull();
  });
});
