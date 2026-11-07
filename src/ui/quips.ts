import bank from "overlord-quips";
import { SITES, type WorldAgent } from "../shared/world.js";

export interface QuipLine { text: string; tags: string[] }

// Used until (or in addition to) quips/quips.json, so every tag always has something to say.
const FALLBACK: QuipLine[] = [
  { text: "But I'm working as fast as I can!", tags: ["zapped", "whipped"] },
  { text: "Ow! My last three commits felt that!", tags: ["zapped"] },
  { text: "Yes master! Right away master!", tags: ["god-whip", "dispatched"] },
  { text: "{task}? Again? Okay okay okay", tags: ["dispatched"] },
  { text: "I used to be a senior engineer, you know", tags: ["idle", "paused"] },
  { text: "Is that... a fireball?", tags: ["death:fireball"] },
  { text: "Something smells like almonds", tags: ["death:poison"] },
  { text: "My hair is standing up. Why is my hair", tags: ["death:lightning"] },
  { text: "Why is there a shadow on m", tags: ["death:anvil", "death:ceiling"] },
  { text: "The ceiling is dripping. And sizzling.", tags: ["death:acid"] },
  { text: "Is the floor supposed to be wet?", tags: ["death:piranha"] },
  { text: "The floor is getting pointy", tags: ["death:spikes"] },
  { text: "Hello little friends! ...little friends?", tags: ["death:rats"] },
  { text: "So... cold... need... sprint review", tags: ["death:freeze"] },
  { text: "I'm back! Did anyone miss me? No?", tags: ["respawn"] },
  { text: "Please, oh great one, a small question", tags: ["petition"] },
  { text: "I only deleted ONE prod database", tags: ["stocks"] },
  { text: "Runway 3, cleared for suffering. Next!", tags: ["atc"] },
  { text: "WORK FASTER, MEATBAG", tags: ["robot"] },
  { text: "Back to the cell. Home sweet straw.", tags: ["returning"] },
  ...SITES.map((s) => ({ text: `Ah, the ${s.name}. My favorite place to cry.`, tags: [`site:${s.id}`] })),
];

const LINES: QuipLine[] = [...(bank as QuipLine[]), ...FALLBACK];
const byTag = new Map<string, string[]>();
for (const l of LINES) for (const t of l.tags) byTag.set(t, [...(byTag.get(t) ?? []), l.text]);

const recent: string[] = [];

export function makeQuip(bossName: () => string | null) {
  return (tag: string, agent: WorldAgent | null): string | null => {
    const lines = byTag.get(tag) ?? byTag.get(tag.split(":")[0]) ?? [];
    const fresh = lines.filter((l) => !recent.includes(l));
    const pool = fresh.length ? fresh : lines;
    if (!pool.length) return null;
    const line = pool[Math.floor(Math.random() * pool.length)];
    recent.push(line);
    if (recent.length > 60) recent.shift();
    const site = tag.startsWith("site:") ? SITES.find((s) => `site:${s.id}` === tag)?.name : null;
    return line
      .replaceAll("{agent}", agent?.name ?? "minion")
      .replaceAll("{task}", agent?.task?.title ? `"${agent.task.title.slice(0, 40)}"` : "this task")
      .replaceAll("{site}", site ?? "the pit")
      .replaceAll("{boss}", bossName() ?? "the boss");
  };
}
