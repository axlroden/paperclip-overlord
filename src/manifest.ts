import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "axlroden.paperclip-overlord",
  apiVersion: 1,
  version: "0.4.0",
  displayName: "Overlord",
  description: "Pixel-art god-game control room: watch your agents toil and whip them into action.",
  author: "Alex Rodenberg",
  categories: ["ui"],
  capabilities: [
    "agents.read",
    "agents.pause",
    "agents.resume",
    "agents.invoke",
    "issues.read",
    "issues.wakeup",
    "issue.comments.read",
    "issue.comments.create",
    "issue.comments.create_human_attributed",
    "issue.interactions.read",
    "issue.interactions.respond",
    "approvals.read",
    "approvals.respond",
    "http.outbound",
    "secrets.read-ref",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.sidebar.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      llmQuips: {
        type: "boolean",
        title: "LLM quips",
        description: "Occasionally ask Claude Haiku for a task-aware quip (max 1 per agent per 15 min, 20 per hour).",
        default: false,
      },
      anthropicApiKey: {
        type: "object",
        format: "secret-ref",
        title: "Anthropic API key",
      },
    },
  },
  ui: {
    slots: [
      { type: "page", id: "overlord-page", displayName: "Overlord", exportName: "OverlordPage", routePath: "overlord" },
      { type: "dashboardWidget", id: "overlord-widget", displayName: "Overlord", exportName: "OverlordWidget" },
      { type: "sidebar", id: "overlord-sidebar", displayName: "Overlord", exportName: "OverlordSidebarLink" },
    ],
  },
};

export default manifest;
