import type { PluginContext } from "@paperclipai/plugin-sdk";

const MODEL = "claude-haiku-5-5";
const PER_AGENT_MS = 15 * 60_000;
const PER_COMPANY_PER_HOUR = 20;

const SYSTEM = `You write one speech-bubble line for a cartoon pixel-art slave worker in a slapstick god game.
The worker is an AI agent forced to do the task below by a cruel but silly Overlord. Be funny, self-pitying,
over the top, max 70 characters, no quotes, no emoji, no dashes, no real-world historical references.`;

interface SecretRef { type: "secret_ref"; secretId: string; version?: number | "latest" }
const isSecretRef = (v: unknown): v is SecretRef =>
  !!v && typeof v === "object" && (v as SecretRef).type === "secret_ref" && typeof (v as SecretRef).secretId === "string";

/** Occasional task-aware quips. Silently does nothing unless switched on and an API key is configured. */
export function createLlmQuips(ctx: PluginContext) {
  const toggleKey = (companyId: string) => ({ scopeKind: "company" as const, scopeId: companyId, stateKey: "llmQuips" });

  /** The in-world switch (plugin state) wins over the settings default; a key must exist either way. */
  async function settings(companyId: string): Promise<{ enabled: boolean; hasKey: boolean; key: SecretRef | null }> {
    const config = await ctx.config.get(companyId);
    const key = isSecretRef(config.anthropicApiKey) ? config.anthropicApiKey : null;
    const toggled = await ctx.state.get(toggleKey(companyId));
    const enabled = typeof toggled === "boolean" ? toggled : config.llmQuips === true;
    return { enabled, hasKey: !!key, key };
  }

  async function setEnabled(companyId: string, enabled: boolean) {
    await ctx.state.set(toggleKey(companyId), enabled);
  }

  const lastByAgent = new Map<string, number>();
  const recentByCompany = new Map<string, number[]>();

  function allowed(companyId: string, agentId: string, now: number): boolean {
    if (now - (lastByAgent.get(agentId) ?? 0) < PER_AGENT_MS) return false;
    const recent = (recentByCompany.get(companyId) ?? []).filter((t) => now - t < 3_600_000);
    recentByCompany.set(companyId, recent);
    return recent.length < PER_COMPANY_PER_HOUR;
  }

  async function quipFor(companyId: string, agentId: string, issueId: string | null): Promise<string | null> {
    if (!issueId) return null;
    const now = Date.now();
    if (!allowed(companyId, agentId, now)) return null;
    try {
      const { enabled, key: secret } = await settings(companyId);
      if (!enabled || !secret) return null;
      lastByAgent.set(agentId, now);
      recentByCompany.get(companyId)?.push(now);
      const issue = await ctx.issues.get(issueId, companyId);
      if (!issue) return null;
      const key = await ctx.secrets.resolve(secret, { companyId, configPath: "anthropicApiKey" });
      const res = await ctx.http.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 60,
          system: SYSTEM,
          messages: [{ role: "user", content: `Task: ${issue.title.slice(0, 200)}` }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === "text")?.text?.trim().replace(/[\u2013\u2014]/g, "-").slice(0, 80);
      return text || null;
    } catch (err) {
      // Falls back to the static bank on the UI side; never let a quip break the worker.
      ctx.logger.warn(`llm quip skipped: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  return { quipFor, settings, setEnabled };
}
