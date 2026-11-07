import { describe, expect, it } from "vitest";
import quips from "./quips.json" with { type: "json" };

type Quip = { text: string; tags: string[] };
const bank = quips as Quip[];

const TAGS = [
  ...["coal-mine", "sweatshop", "quarry", "galley", "treadwheel", "foundry", "pyramid", "sewer", "glacier", "token-refinery"].map((s) => `site:${s}`),
  ...["fireball", "poison", "lightning", "anvil", "acid", "piranha", "spikes", "rats", "ceiling", "freeze"].map((d) => `death:${d}`),
  "whipped", "zapped", "dispatched", "returning", "stocks", "petition", "god-whip", "idle", "paused", "respawn", "atc", "robot",
];
const SLOTS = new Set(["agent", "task", "site", "boss"]);

describe("quip bank", () => {
  it("has at least 1000 lines", () => {
    expect(bank.length).toBeGreaterThanOrEqual(1000);
  });

  it("has no duplicate texts (case-insensitive)", () => {
    const seen = new Set<string>();
    const dups = bank.map((q) => q.text.toLowerCase()).filter((t) => seen.has(t) || !seen.add(t));
    expect(dups).toEqual([]);
  });

  it("gives every known tag at least 30 lines and uses no unknown tags", () => {
    for (const tag of TAGS) expect(bank.filter((q) => q.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(30);
    const unknown = bank.flatMap((q) => q.tags).filter((t) => !TAGS.includes(t));
    expect(unknown).toEqual([]);
  });

  it("uses only known slots, no dashes, and fits a bubble", () => {
    for (const { text, tags } of bank) {
      expect(text.trim(), text).not.toBe("");
      expect(tags.length, text).toBeGreaterThan(0);
      for (const [, slot] of text.matchAll(/\{([^}]*)\}/g)) expect(SLOTS.has(slot), `${slot} in ${text}`).toBe(true);
      expect(/[\u2013\u2014]/.test(text), text).toBe(false);
      expect(text.length, text).toBeLessThanOrEqual(80);
    }
  });
});
